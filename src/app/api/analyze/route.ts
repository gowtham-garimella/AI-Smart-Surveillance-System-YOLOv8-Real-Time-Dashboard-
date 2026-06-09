import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getPool, initDb } from '@/lib/db';
import { explainSurveillanceVideo } from '@/lib/ai';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate the User
    const token = req.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Session invalid or expired. Please log in again." }, { status: 401 });
    }

    // 2. Parse Multipart Form Data
    const formData = await req.formData();
    const videoFile = formData.get('videoFile') as File | null;
    const videoUrl = formData.get('videoUrl') as string | null;
    const confidence = parseFloat((formData.get('confidence') as string) || '0.5');
    const alertsStr = (formData.get('alerts') as string) || 'person,car';
    const frameSkip = parseInt((formData.get('frameSkip') as string) || '2', 10);

    // 3. Ensure Upload Directories Exist in Public Directory
    const publicDir = path.join(process.cwd(), 'public');
    const uploadDirOriginal = path.join(publicDir, 'uploads', 'original');
    const uploadDirProcessed = path.join(publicDir, 'uploads', 'processed');

    fs.mkdirSync(uploadDirOriginal, { recursive: true });
    fs.mkdirSync(uploadDirProcessed, { recursive: true });

    let originalVideoPathLocal = '';
    let videoName = '';
    let sourceUrl = '';

    if (videoFile && videoFile.size > 0) {
      // Handle File Upload
      videoName = videoFile.name;
      const fileExt = path.extname(videoName) || '.mp4';
      const fileBase = path.basename(videoName, fileExt);
      const uniqueName = `${Date.now()}_${fileBase}${fileExt}`;
      
      const buffer = Buffer.from(await videoFile.arrayBuffer());
      const savePath = path.join(uploadDirOriginal, uniqueName);
      fs.writeFileSync(savePath, buffer);
      
      originalVideoPathLocal = `/uploads/original/${uniqueName}`;
    } else if (videoUrl && videoUrl.trim() !== '') {
      // Handle Video Link URL and clean copy-paste trailing brackets/parentheses
      sourceUrl = videoUrl.trim().replace(/[)\]"'>]+$/, '');
      const isYoutube = sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be');
      const uniqueName = `${Date.now()}_download.mp4`;
      const savePath = path.join(uploadDirOriginal, uniqueName);
      
      videoName = isYoutube ? "YouTube Stream" : path.basename(sourceUrl) || "Network Camera";
      
      if (isYoutube) {
        // Try to download using yt-dlp, otherwise throw an error
        try {
          console.log(`Downloading YouTube URL via yt-dlp to: ${savePath}`);
          let ytDlpCmd = 'yt-dlp';
          if (fs.existsSync('/opt/homebrew/bin/yt-dlp')) {
            ytDlpCmd = '/opt/homebrew/bin/yt-dlp';
          } else if (fs.existsSync('/usr/local/bin/yt-dlp')) {
            ytDlpCmd = '/usr/local/bin/yt-dlp';
          }
          await execPromise(`"${ytDlpCmd}" -f mp4 -o "${savePath}" "${sourceUrl}"`);
        } catch (ytErr) {
          console.error("yt-dlp download failed:", ytErr);
          return NextResponse.json({ 
            error: "YouTube stream download failed. Host system lacks 'yt-dlp' or network is blocked. Please upload a local video file instead." 
          }, { status: 400 });
        }
      } else {
        // Fetch direct MP4 URL with custom browser User-Agent
        try {
          console.log(`Downloading direct video link: ${sourceUrl}`);
          const res = await fetch(sourceUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          if (!res.ok) {
            throw new Error(`Server returned HTTP ${res.status}`);
          }
          const buffer = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(savePath, buffer);
        } catch (fetchErr: any) {
          console.error("Direct video link download failed:", fetchErr);
          return NextResponse.json({ 
            error: `Direct link download failed (${fetchErr.message}). The host server may have blocked the request (e.g. Cloudflare 403). Please upload a local video file instead.` 
          }, { status: 400 });
        }
      }
      originalVideoPathLocal = `/uploads/original/${uniqueName}`;
    } else {
      return NextResponse.json({ error: "Please upload a video file or submit a video URL." }, { status: 400 });
    }

    // 4. Set Up Output processed path (detect image vs video)
    const isImage = videoName.toLowerCase().endsWith('.png') || 
                    videoName.toLowerCase().endsWith('.jpg') || 
                    videoName.toLowerCase().endsWith('.jpeg') || 
                    videoName.toLowerCase().endsWith('.webp') ||
                    videoName.toLowerCase().endsWith('.bmp');
                    
    const fileExt = isImage ? path.extname(videoName) : '.mp4';
    const processedUniqueName = `${Date.now()}_processed${fileExt}`;
    const absoluteProcessedPath = path.join(uploadDirProcessed, processedUniqueName);
    const processedVideoPathLocal = `/uploads/processed/${processedUniqueName}`;

    // Absolute path of the input video for the python execution script
    const absoluteInputPath = path.join(publicDir, originalVideoPathLocal);

    // 5. Execute process_video.py CLI
    const scriptPath = path.join(process.cwd(), 'process_video.py');
    let pythonCmd = 'python3';
    const venvPythonPath = path.join(process.cwd(), '..', '.surveillance-venv', 'bin', 'python3');
    if (fs.existsSync(venvPythonPath)) {
      pythonCmd = venvPythonPath;
    }
    const command = `"${pythonCmd}" "${scriptPath}" --input "${absoluteInputPath}" --output "${absoluteProcessedPath}" --conf ${confidence} --alerts "${alertsStr}" --frame_skip ${frameSkip}`;
    
    console.log(`Running analysis command: ${command}`);
    
    let pythonOutput: any = {};
    try {
      const { stdout, stderr } = await execPromise(command);
      if (stderr) {
        console.warn("Python execution warning/stderr:", stderr);
      }
      const lines = stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      pythonOutput = JSON.parse(lastLine);
    } catch (cmdErr: any) {
      console.error("Failed to execute process_video.py script:", cmdErr);
      return NextResponse.json({ error: "Video processing failed. Verify local environment python config." }, { status: 500 });
    }

    // 6. Generate AI Video Explanation Report
    const aiInput = {
      videoName: videoName,
      objectCounts: pythonOutput.object_counts || {},
      alerts: pythonOutput.alerts || [],
      recentLogs: pythonOutput.recent_logs || []
    };

    const explanation = await explainSurveillanceVideo(aiInput);

    // 7. Save Session to PostgreSQL
    await initDb();
    const pool = getPool();

    const dbResult = await pool.query(
      `INSERT INTO surveillance_sessions 
       (user_id, video_name, video_url, original_video_path, processed_video_path, object_counts, alerts, recent_logs, ai_explanation) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [
        decoded.userId,
        videoName,
        sourceUrl || null,
        originalVideoPathLocal,
        processedVideoPathLocal,
        JSON.stringify(pythonOutput.object_counts || {}),
        JSON.stringify(pythonOutput.alerts || []),
        JSON.stringify(pythonOutput.recent_logs || []),
        explanation
      ]
    );

    const savedSession = dbResult.rows[0];

    return NextResponse.json({
      session: {
        id: savedSession.id,
        videoName: savedSession.video_name,
        videoUrl: savedSession.video_url,
        originalVideoPath: savedSession.original_video_path,
        processedVideoPath: savedSession.processed_video_path,
        objectCounts: savedSession.object_counts,
        alerts: savedSession.alerts,
        recentLogs: savedSession.recent_logs,
        aiExplanation: savedSession.ai_explanation,
        createdAt: savedSession.created_at
      }
    });

  } catch (error: any) {
    console.error("Error in analyze route handler:", error);
    return NextResponse.json({ error: error.message || "An unexpected error occurred during analysis." }, { status: 500 });
  }
}
