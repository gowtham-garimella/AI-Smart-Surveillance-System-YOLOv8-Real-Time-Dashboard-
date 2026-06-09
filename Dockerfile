# Use a base image that includes both Python 3.11 and Node.js 20
FROM nikolaik/python-nodejs:python3.11-nodejs20-slim

WORKDIR /app

# Install system dependencies required by OpenCV & media codecs
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy package configuration files and install Node.js dependencies
COPY package*.json ./
RUN npm ci

# Install Python machine learning dependencies (YOLOv8, OpenCV, and Pandas)
RUN pip install --no-cache-dir ultralytics opencv-python pandas yt-dlp

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
