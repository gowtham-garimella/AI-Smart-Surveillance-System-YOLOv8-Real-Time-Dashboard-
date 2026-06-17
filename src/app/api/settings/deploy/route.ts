import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

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

    // 2. Fetch the Render Deploy Hook URL from database
    const pool = getPool();
    const dbResult = await pool.query("SELECT value FROM system_settings WHERE key = 'render_deploy_hook_url'");
    let deployUrl = dbResult.rows[0]?.value;

    // Fall back to environment variable if not stored in DB
    if (!deployUrl) {
      deployUrl = process.env.RENDER_DEPLOY_HOOK_URL;
    }

    if (!deployUrl || !deployUrl.startsWith('http')) {
      return NextResponse.json({ 
        error: "Render Deploy Hook URL is not configured. Please save a valid URL in Settings first." 
      }, { status: 400 });
    }

    console.log(`[Deploy] Dispatching deployment request to Render Webhook...`);
    
    // 3. Ping the deploy hook URL (Render accepts both GET and POST requests)
    const deployResponse = await fetch(deployUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'OMNI-SEC-Deployment-Trigger'
      }
    });

    if (!deployResponse.ok) {
      const errorText = await deployResponse.text();
      console.error(`[Deploy] Render webhook failed:`, errorText);
      return NextResponse.json({ 
        error: `Render deploy webhook returned status ${deployResponse.status}: ${errorText}` 
      }, { status: 502 });
    }

    const responseData = await deployResponse.json().catch(() => ({}));
    console.log(`[Deploy] Render webhook response:`, responseData);

    return NextResponse.json({
      success: true,
      message: "Render deployment triggered successfully.",
      details: responseData
    });

  } catch (error: any) {
    console.error("Error in settings/deploy POST handler:", error);
    return NextResponse.json({ error: error.message || "Failed to trigger Render deployment." }, { status: 500 });
  }
}
