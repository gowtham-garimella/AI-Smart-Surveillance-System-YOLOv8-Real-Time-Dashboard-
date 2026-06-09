import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getPool, initDb } from '@/lib/db';
import { signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password || username.trim() === '' || password.trim() === '') {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    await initDb();
    const pool = getPool();

    // Query for the user
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    const user = result.rows[0];

    // Compare passwords
    const isPasswordMatch = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordMatch) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    // Sign JWT
    const token = signToken({ userId: user.id, username: user.username });

    // Build the response and attach HTTP-Only Cookie
    const response = NextResponse.json({
      message: "Login successful",
      user: { id: user.id, username: user.username }
    });

    response.cookies.set({
      name: 'token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    });

    return response;
  } catch (error: any) {
    console.error("Error during login API handler:", error);
    return NextResponse.json({ error: "Internal server error. Please try again." }, { status: 500 });
  }
}
