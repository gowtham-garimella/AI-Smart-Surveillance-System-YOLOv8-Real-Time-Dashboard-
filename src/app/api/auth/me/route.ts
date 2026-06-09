import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid or expired session token." }, { status: 401 });
    }

    return NextResponse.json({
      user: { id: decoded.userId, username: decoded.username }
    });
  } catch (error: any) {
    console.error("Error during auth/me API handler:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
