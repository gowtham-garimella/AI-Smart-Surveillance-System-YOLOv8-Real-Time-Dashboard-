import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getPool, initDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password || username.trim() === '' || password.trim() === '') {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    // Auto-initialize DB schema if tables don't exist yet
    await initDb();

    const pool = getPool();

    // Check if username already exists
    const existing = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "Username already exists. Please choose another one." }, { status: 409 });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user into the DB
    await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
      [username.trim(), passwordHash]
    );

    return NextResponse.json({ message: "User registered successfully" }, { status: 201 });
  } catch (error: any) {
    console.error("Error during registration API handler:", error);
    return NextResponse.json({ error: "Internal server error. Please try again." }, { status: 500 });
  }
}
