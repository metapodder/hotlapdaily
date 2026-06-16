import { NextRequest, NextResponse } from "next/server";

/**
 * Checks if the request has a valid auth cookie.
 * Returns null if valid, or an error NextResponse if not.
 */
export function checkDashboardAuth(request: NextRequest): NextResponse | null {
  const token = request.cookies.get("dashboard_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decoded = Buffer.from(token, "base64").toString();
    if (!decoded.startsWith("admin:")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null; // valid
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
