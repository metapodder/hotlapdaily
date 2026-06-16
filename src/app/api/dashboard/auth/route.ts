import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.password !== "string") {
      return NextResponse.json({ error: "Missing password" }, { status: 400 });
    }

    const adminPassword = process.env.PASSWORD_ADMIN;
    if (!adminPassword) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    if (body.password !== adminPassword) {
      return NextResponse.json({ error: "Wrong password" }, { status: 401 });
    }

    // Set an httpOnly cookie as the session token
    const token = Buffer.from(`admin:${Date.now()}`).toString("base64");
    const res = NextResponse.json({ success: true });
    res.cookies.set("dashboard_token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
