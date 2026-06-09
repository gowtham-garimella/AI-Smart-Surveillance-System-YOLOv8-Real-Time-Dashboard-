# 🛡️ OMNI-SEC: AI Smart Surveillance Real-Time Dashboard

OMNI-SEC is a high-fidelity, secure real-time threat intelligence and video analysis dashboard. The application is built using **Next.js 16 (App Router)**, **TypeScript**, **PostgreSQL**, and a backend **Python YOLOv8 frame analysis engine**, featuring a striking neon-green/magenta cyberpunk glassmorphic design system.

---

## ⚡ Key Features

*   **Real-Time Frame Scan**: Dual-player video console comparing raw camera streams side-by-side with processed YOLOv8 object bounding boxes.
*   **80 COCO Warning Alerts**: Collapsible, categorized checkboxes allowing operators to toggle sector warnings for all 80 pre-trained COCO objects (Vehicles, People, Animals, Sports gear, Appliances, and more).
*   **Wider UI Controls**: High-legibility warnings panel featuring select/deselect all, category badges (`Checked/Total`), and responsive checkbox columns.
*   **Concise Telemetry Logging**: Chronological event logs with intelligent deduplication (logging at most once per second per class) and peak-occupancy diagnostics (max simultaneous counts in any single frame).
*   **Automated Security Reports**: AI-generated SOC summaries of surveillance timeline logs powered by Google Gemini (with rule-based offline fallback).
*   **Persistent SQLite/Postgres History**: Operator signup/login credentials secured with `bcryptjs` and session tokens stored in secure JWT cookies, with full video and telemetry histories saved in PostgreSQL.

---

## 📋 Prerequisites & Local Setup

### 1. System Requirements (macOS)
The video analysis engine relies on python libraries and downloading utilities:
*   **Homebrew**: Required to install the video downloader.
*   **PostgreSQL**: A local Postgres instance.
*   **Python 3.10+**: For YOLOv8.

### 2. Install Network Streaming Downloader
Install `yt-dlp` using Homebrew to support direct parsing of YouTube surveillance feeds:
```bash
brew install yt-dlp
```

### 3. Create the Python Virtual Environment
To run the object detection pipeline locally with high accuracy:
1. Navigate to the parent directory of the project (e.g., `Desktop/`) and create the virtual environment:
   ```bash
   python3 -m venv ../.surveillance-venv
   ```
2. Install the machine learning dependencies inside the virtual environment:
   ```bash
   ../.surveillance-venv/bin/pip install ultralytics opencv-python pandas
   ```

---

## ⚙️ Configuration (.env.local)

Create a `.env.local` file in the project root folder:
```env
# Database connection string (e.g. Local PostgreSQL or Neon.tech)
DATABASE_URL=postgresql://USERNAME:PASSWORD@localhost:5432/surveillance_db

# JWT cookie authentication secret
JWT_SECRET=your_custom_secure_jwt_secret_here

# Enable Gemini AI SOC Incident Reports (Optional - falls back to local analyzer if left blank)
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

---

## 🚀 Running the App Locally

1.  **Initialize PostgreSQL**: Start your local Postgres server and ensure a database named `surveillance_db` exists.
2.  **Start Development Server**:
    ```bash
    npm run dev
    ```
3.  **Access Local Server**: Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## 🛠️ Step-by-Step Testing Guide

1.  **Create Operator Account**: Head to [http://localhost:3000/login](http://localhost:3000/login) and register a new security credentials account.
2.  **Toggle Sector Alerts**:
    *   Click the **Queue Stream** tab.
    *   Expand collapsible accordion groups like *Vehicles & Transport* or *Animals*.
    *   Check items to alert on (e.g., `car`, `bus`, `person`, `dog`).
3.  **Provide Stream Source**:
    *   **Direct MP4 Link (Recommended)**: Paste:
        `https://github.com/intel-iot-devkit/sample-videos/raw/master/person-bicycle-car-detection.mp4`
    *   **YouTube Video**: Paste:
        `https://www.youtube.com/watch?v=aqz-KE-bpKQ`
4.  **Analyze**: Click **Initiate AI Frame Analysis Sequence**. The original and bounding-boxed H.264 video streams will load side-by-side.
