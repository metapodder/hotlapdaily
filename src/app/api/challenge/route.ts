import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

// Simple in-memory rate limiter per IP
const challengeRateWindowMs = 60_000;
const challengeMaxRequests = 20; // per minute per IP
const challengeBuckets: Map<string, number[]> = new Map();

function getClientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  const xReal = req.headers.get("x-real-ip");
  if (xReal) return xReal.trim();
  // As a last resort, try a possible runtime-provided ip field
  const nrIp: unknown = (req as unknown as { ip?: unknown }).ip;
  if (typeof nrIp === "string" && nrIp.trim()) return nrIp.trim();
  return "0.0.0.0";
}

function rateLimit(ip: string, windowMs: number, maxReq: number, buckets: Map<string, number[]>): boolean {
  const now = Date.now();
  const arr = buckets.get(ip) || [];
  const recent = arr.filter((t) => now - t <= windowMs);
  if (recent.length >= maxReq) return false;
  recent.push(now);
  buckets.set(ip, recent);
  return true;
}

function getSecret(): string {
  const envSecret = process.env.HOTLAPDAILY_CHALLENGE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (envSecret && envSecret.trim()) return envSecret;
  // Ephemeral process secret (resets on deploy)
  const g = global as unknown as { __hl_ephemeral_secret?: string };
  if (!g.__hl_ephemeral_secret) {
    g.__hl_ephemeral_secret = crypto.randomBytes(32).toString("hex");
  }
  return g.__hl_ephemeral_secret;
}

function hmacSHA256Hex(key: string, message: string): string {
  return crypto.createHmac("sha256", key).update(message).digest("hex");
}

function sha256Hex(message: string): string {
  return crypto.createHash("sha256").update(message).digest("hex");
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!rateLimit(ip, challengeRateWindowMs, challengeMaxRequests, challengeBuckets)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const ua = request.headers.get("user-agent") || "";
    const uaHash = sha256Hex(ua);

    // Retrieve or set a session cookie to bind challenge to browser session
    const cookieStore = request.cookies;
    let session = cookieStore.get("hl_session")?.value || "";
    if (!session) {
      session = crypto.randomBytes(16).toString("hex");
    }

    const now = Date.now();
    const ttlMs = 2 * 60 * 1000; // 2 minutes
    const payload = {
      session,
      uaHash,
      issuedAt: now,
      expiresAt: now + ttlMs,
      powPrefix: "0000", // 16-bit difficulty (~1/65536)
    };
    const challengeJson = JSON.stringify(payload);
    const challengeB64 = Buffer.from(challengeJson, "utf8").toString("base64");
    const secret = getSecret();
    const signature = hmacSHA256Hex(secret, challengeB64);

    const res = NextResponse.json({ challenge: challengeB64, signature, powPrefix: payload.powPrefix });
    // Set/refresh session cookie (httpOnly=false so client JS can read if needed, but we only require it to be sent back automatically)
    res.cookies.set("hl_session", session, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}


