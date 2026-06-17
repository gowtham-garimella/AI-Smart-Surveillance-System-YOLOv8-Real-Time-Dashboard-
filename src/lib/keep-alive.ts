import { getPool } from './db';

let keepAliveInterval: NodeJS.Timeout | null = null;

export async function startKeepAlive() {
  if (keepAliveInterval) {
    return; // Already running
  }

  const runPing = async () => {
    try {
      const pool = getPool();
      // Check if keep alive is enabled
      const res = await pool.query("SELECT value FROM system_settings WHERE key = 'keep_alive_enabled'");
      const enabled = res.rows[0]?.value === 'true';

      if (!enabled) {
        stopKeepAlive();
        return;
      }

      const urlRes = await pool.query("SELECT value FROM system_settings WHERE key = 'app_external_url'");
      const url = urlRes.rows[0]?.value;

      if (url && url.startsWith('http')) {
        console.log(`[Keep-Alive] Pinging self at: ${url}`);
        const pingRes = await fetch(url, {
          headers: { 'User-Agent': 'OMNI-SEC-KeepAlive' }
        });
        console.log(`[Keep-Alive] Ping response: ${pingRes.status}`);
      }
    } catch (err) {
      console.error("[Keep-Alive] Ping failed:", err);
    }
  };

  // Start checking/pinging every 10 minutes (600,000 ms)
  keepAliveInterval = setInterval(runPing, 10 * 60 * 1000);

  // Run once immediately on start
  console.log("[Keep-Alive] Started self-ping background worker.");
  runPing();
}

export function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log("[Keep-Alive] Stopped self-ping background worker.");
  }
}

// Function to initialize on server start / first request
export async function initKeepAlive() {
  try {
    const pool = getPool();
    const res = await pool.query("SELECT value FROM system_settings WHERE key = 'keep_alive_enabled'");
    const enabled = res.rows[0]?.value === 'true';
    if (enabled) {
      await startKeepAlive();
    }
  } catch (err) {
    // If table doesn't exist yet, it's fine, it will be initialized later
    console.warn("[Keep-Alive] Database settings not ready yet for Keep-Alive.");
  }
}
