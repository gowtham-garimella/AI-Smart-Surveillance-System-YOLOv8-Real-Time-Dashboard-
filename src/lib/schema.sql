-- Table definitions for AI Smart Surveillance System Dashboard

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS surveillance_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  video_name VARCHAR(255) NOT NULL,
  video_url TEXT,
  original_video_path VARCHAR(255) NOT NULL,
  processed_video_path VARCHAR(255) NOT NULL,
  object_counts JSONB NOT NULL,
  alerts JSONB NOT NULL,
  recent_logs JSONB NOT NULL,
  ai_explanation TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
