# Use a base image that includes both Python 3.11 and Node.js 20
FROM nikolaik/python-nodejs:python3.11-nodejs20-slim

WORKDIR /app

# Install system dependencies required by OpenCV & media codecs
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy package configuration files and install Node.js dependencies
COPY package*.json ./
RUN npm ci

# Install Python machine learning dependencies (YOLOv8, OpenCV, and Pandas)
# Force cache bust to install latest yt-dlp decryption signatures (updated 2026-06-17)
RUN pip install --no-cache-dir ultralytics opencv-python pandas && \
    pip install --no-cache-dir --upgrade yt-dlp

# Pre-download the YOLOv8n model weights so they are built-in and do not cause runtime download hangs
RUN python3 -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

# Set PyTorch thread limits to prevent CPU thread deadlocks / OOM crashes on Render (512MB RAM)
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1
ENV OPENBLAS_NUM_THREADS=1
ENV VECLIB_MAXIMUM_THREADS=1
ENV NUMEXPR_NUM_THREADS=1

# Copy all project source code
COPY . .

# Set environment to production and disable telemetry
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Compile Next.js build
RUN npm run build

# Expose Next.js server port
EXPOSE 3000

# Start production Next.js server
CMD ["npm", "start"]
