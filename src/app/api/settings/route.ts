import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getPool, initDb } from '@/lib/db';
import { startKeepAlive, stopKeepAlive } from '@/lib/keep-alive';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user
    const token = req.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Session invalid or expired. Please log in again." }, { status: 401 });
    }

    // 2. Initialize DB to make sure system_settings table exists
    await initDb();
    const pool = getPool();

    // 3. Query all settings
    const dbResult = await pool.query('SELECT key, value FROM system_settings');
    const settings: Record<string, string> = {};
    
    // Default values
    settings['render_deploy_hook_url'] = '';
    settings['app_external_url'] = '';
    settings['keep_alive_enabled'] = 'false';

    dbResult.rows.forEach((row: any) => {
      settings[row.key] = row.value;
    });

    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error("Error in settings GET handler:", error);
    return NextResponse.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const token = req.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Session invalid or expired. Please log in again." }, { status: 401 });
    }

    // 2. Parse payload
    const body = await req.json();
    const { renderDeployHookUrl, appExternalUrl, keepAliveEnabled } = body;

    // 3. Initialize DB
    await initDb();
    const pool = getPool();

    const upsertQuery = `
      INSERT INTO system_settings (key, value, updated_at) 
      VALUES ($1, $2, CURRENT_TIMESTAMP) 
      ON CONFLICT (key) 
      DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
    `;

    // Save Render Deploy Hook URL
    if (typeof renderDeployHookUrl === 'string') {
      await pool.query(upsertQuery, ['render_deploy_hook_url', renderDeployHookUrl.trim()]);
    }

    // Save External App URL
    if (typeof appExternalUrl === 'string') {
      await pool.query(upsertQuery, ['app_external_url', appExternalUrl.trim()]);
    }

    // Save Keep-Alive Enabled status
    if (typeof keepAliveEnabled === 'boolean' || typeof keepAliveEnabled === 'string') {
      const isEnabledStr = String(keepAliveEnabled) === 'true';
      await pool.query(upsertQuery, ['keep_alive_enabled', isEnabledStr ? 'true' : 'false']);
      
      // Dynamically start or stop the keep-alive runner depending on the updated setting
      if (isEnabledStr) {
        await startKeepAlive();
      } else {
        stopKeepAlive();
      }
    }

    return NextResponse.json({ success: true, message: "System settings updated successfully." });
  } catch (error: any) {
    console.error("Error in settings POST handler:", error);
    return NextResponse.json({ error: error.message || "Failed to update system settings." }, { status: 500 });
  }
}
