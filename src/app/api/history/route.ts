import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getPool, initDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Session invalid or expired. Please log in again." }, { status: 401 });
    }

    await initDb();
    const pool = getPool();

    const result = await pool.query(
      `SELECT id, video_name, video_url, original_video_path, processed_video_path, object_counts, alerts, recent_logs, ai_explanation, created_at 
       FROM surveillance_sessions 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [decoded.userId]
    );

    const history = result.rows.map((row: any) => ({
      id: row.id,
      videoName: row.video_name,
      videoUrl: row.video_url,
      originalVideoPath: row.original_video_path,
      processedVideoPath: row.processed_video_path,
      objectCounts: row.object_counts,
      alerts: row.alerts,
      recentLogs: row.recent_logs,
      aiExplanation: row.ai_explanation,
      createdAt: row.created_at
    }));

    return NextResponse.json({ history });
  } catch (error: any) {
    console.error("Error in history route:", error);
    return NextResponse.json({ error: "Failed to retrieve surveillance history." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Session invalid or expired." }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Session ID is required." }, { status: 400 });
    }

    await initDb();
    const pool = getPool();

    // 1. Fetch file paths before deleting from db
    const fileResult = await pool.query(
      `SELECT original_video_path, processed_video_path 
       FROM surveillance_sessions 
       WHERE id = $1 AND user_id = $2`,
      [id, decoded.userId]
    );

    if (fileResult.rows.length === 0) {
      return NextResponse.json({ error: "Session not found or unauthorized." }, { status: 404 });
    }

    const { original_video_path, processed_video_path } = fileResult.rows[0];

    // 2. Safely delete local video files from public directory
    const publicDir = path.join(process.cwd(), 'public');
    
    if (original_video_path) {
      try {
        const absPath = path.join(publicDir, original_video_path);
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
      } catch (err) {
        console.error("Failed to delete original video file:", err);
      }
    }

    if (processed_video_path) {
      try {
        const absPath = path.join(publicDir, processed_video_path);
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
      } catch (err) {
        console.error("Failed to delete processed video file:", err);
      }
    }

    // 3. Delete DB record
    await pool.query(
      `DELETE FROM surveillance_sessions WHERE id = $1 AND user_id = $2`,
      [id, decoded.userId]
    );

    return NextResponse.json({ message: "Session deleted successfully." });
  } catch (error: any) {
    console.error("Error in delete history route:", error);
    return NextResponse.json({ error: "Failed to delete session." }, { status: 500 });
  }
}

