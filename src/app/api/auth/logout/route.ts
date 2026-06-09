import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ message: "Logout successful" });
  
  // Set the token cookie maxAge to 0 to delete it
  response.cookies.set({
    name: 'token',
    value: '',
    httpOnly: true,
    maxAge: 0,
    path: '/'
  });

  return response;
}
