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
        // Try to download using yt-dlp with multiple path fallback candidates
        let downloaded = false;
        let lastError: any = null;

        // Check if there are YouTube cookies stored in the database
        let cookiesPath = '';
        const pool = getPool();
        try {
          const dbResult = await pool.query("SELECT value FROM system_settings WHERE key = 'youtube_cookies'");
          const youtubeCookies = dbResult.rows[0]?.value;
          if (youtubeCookies && youtubeCookies.trim() !== '') {
            cookiesPath = path.join(uploadDirOriginal, `${Date.now()}_cookies.txt`);
            fs.writeFileSync(cookiesPath, youtubeCookies.trim());
            console.log(`[Analyze] Saved YouTube cookies file to: ${cookiesPath}`);
          }
        } catch (cookieDbErr) {
          console.warn("Could not query youtube_cookies from database:", cookieDbErr);
        }

        try {
          // Determine pythonCmd
          let pythonCmd = 'python3';
          const venvPythonPath = path.join(process.cwd(), '..', '.surveillance-venv', 'bin', 'python3');
          if (fs.existsSync(venvPythonPath)) {
            pythonCmd = venvPythonPath;
          }

          // List of candidate commands to run yt-dlp
          const candidates = [];
          if (fs.existsSync('/opt/homebrew/bin/yt-dlp')) {
            candidates.push('"/opt/homebrew/bin/yt-dlp"');
          }
          if (fs.existsSync('/usr/local/bin/yt-dlp')) {
            candidates.push('"/usr/local/bin/yt-dlp"');
          }
          candidates.push('yt-dlp');
          candidates.push(`"${pythonCmd}" -m yt_dlp`);
          if (pythonCmd !== 'python3') {
            candidates.push('python3 -m yt_dlp');
          }

          // Try downloading with candidates
          for (const cmd of candidates) {
            try {
              console.log(`Attempting YouTube download with command: ${cmd}`);
              // Use robust format selection: best mp4 format or best overall
              // --extractor-args "youtube:player-client=ios,android" to bypass signature/bot checks
              // --no-playlist to prevent playlist downloads
              // --merge-output-format mp4 to ensure standard container
              const cookiesArg = cookiesPath ? `--cookies "${cookiesPath}"` : '';
              const fullCmd = `${cmd} -f "bv*[ext=mp4]+ba[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 --no-playlist --extractor-args "youtube:player-client=android_vr,ios,android" ${cookiesArg} -o "${savePath}" "${sourceUrl}"`;
              await execPromise(fullCmd);
              downloaded = true;
              console.log(`YouTube download succeeded using: ${cmd}`);
              break;
            } catch (err: any) {
              console.warn(`YouTube download failed with ${cmd}:`, err.message || err);
              lastError = err;
            }
          }
        } finally {
          // Clean up temporary cookies file if it was created
          if (cookiesPath && fs.existsSync(cookiesPath)) {
            try {
              fs.unlinkSync(cookiesPath);
              console.log(`[Analyze] Cleaned up temporary cookies file.`);
            } catch (unlinkErr) {
              console.error("Failed to delete cookies file:", unlinkErr);
            }
          }
        }

        if (!downloaded) {
          console.error("All YouTube download candidates failed. Last error:", lastError);
          return NextResponse.json({ 
            error: `YouTube stream download failed. Host system lacks 'yt-dlp' / 'ffmpeg', or YouTube is blocking the request. Error: ${lastError?.message || lastError}` 
          }, { status: 400 });
        }
      } else {
        // Fetch direct MP4 URL with custom browser User-Agent
        try {
          console.log(`Downloading direct video link: ${sourceUrl}`);
          const res = await fetch(sourceUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': 'https://www.google.com/'
            }
          });
          if (!res.ok) {
            throw new Error(`Server returned HTTP ${res.status}`);
          }
          const buffer = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(savePath, buffer);
        } catch (fetchErr: any) {
          console.warn("Direct video link fetch failed, falling back to yt-dlp downloader:", fetchErr.message || fetchErr);
          
          let downloaded = false;
          let lastError: any = null;
          
          let pythonCmd = 'python3';
          const venvPythonPath = path.join(process.cwd(), '..', '.surveillance-venv', 'bin', 'python3');
          if (fs.existsSync(venvPythonPath)) {
            pythonCmd = venvPythonPath;
          }

          const candidates = [];
          if (fs.existsSync('/opt/homebrew/bin/yt-dlp')) {
            candidates.push('"/opt/homebrew/bin/yt-dlp"');
          }
          if (fs.existsSync('/usr/local/bin/yt-dlp')) {
            candidates.push('"/usr/local/bin/yt-dlp"');
          }
          candidates.push('yt-dlp');
          candidates.push(`"${pythonCmd}" -m yt_dlp`);
          if (pythonCmd !== 'python3') {
            candidates.push('python3 -m yt_dlp');
          }

          // Build a robust candidates array of different download utilities with headers
          const downloadCmds: string[] = [];
          // A. curl with Chrome user-agent & google referer (Standard on Linux containers)
          downloadCmds.push(`curl -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -H "Referer: https://www.google.com/" -L -k -o "${savePath}" "${sourceUrl}"`);
          
          // B. yt-dlp candidates with user-agent & referer
          candidates.forEach(cmd => {
            downloadCmds.push(`${cmd} --no-playlist --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.google.com/" --no-check-certificates -o "${savePath}" "${sourceUrl}"`);
          });

          // C. wget fallback
          downloadCmds.push(`wget -U "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer="https://www.google.com/" --no-check-certificate -O "${savePath}" "${sourceUrl}"`);

          for (const fullCmd of downloadCmds) {
            try {
              // Extract the utility name for logging (e.g. curl, yt-dlp)
              const utilityName = fullCmd.split(' ')[0] || 'downloader';
              console.log(`Attempting direct link download via: ${utilityName}`);
              await execPromise(fullCmd);
              
              // Verify file was actually downloaded and is not empty
              if (fs.existsSync(savePath) && fs.statSync(savePath).size > 1000) {
                downloaded = true;
                console.log(`Direct link download succeeded via: ${utilityName}`);
                break;
              } else {
                throw new Error("Downloaded file is empty or missing.");
              }
            } catch (err: any) {
              console.warn(`Direct link download utility failed:`, err.message || err);
              lastError = err;
              // Clean up if a partial/empty file was created
              if (fs.existsSync(savePath)) {
                try { fs.unlinkSync(savePath); } catch {}
              }
            }
          }

          if (!downloaded) {
            console.error("Direct video link download failed with both fetch and CLI fallbacks. Last error:", lastError);
            return NextResponse.json({ 
              error: `Direct link download failed (${fetchErr.message}). The host server may have blocked the request (e.g. Cloudflare 403). Please upload a local video file instead.` 
            }, { status: 400 });
          }
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
