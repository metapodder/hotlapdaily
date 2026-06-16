import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { isIpBanned } from "@/lib/bannedIps";
export const runtime = "nodejs";

// POST /api/best-lap
// Body: { bestLap: number, driverName: string, trackName: string, physicsData?: object, antiCheatSummary?: { isValid: boolean, completionPercentage?: number } }
// Basic per-IP rate limit
const submitRateWindowMs = 60_000;
const submitMaxRequests = 10;
const submitBuckets: Map<string, number[]> = new Map();

// IP ban list - these IPs will receive "pls try later" message instead of processing

function getClientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  const xReal = req.headers.get("x-real-ip");
  if (xReal) return xReal.trim();
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

function hmacSHA256Hex(key: string, message: string): string {
  return crypto.createHmac("sha256", key).update(message).digest("hex");
}

function sha256Hex(message: string): string {
  return crypto.createHash("sha256").update(message).digest("hex");
}

function getSecret(): string {
  const envSecret = process.env.HOTLAPDAILY_CHALLENGE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (envSecret && envSecret.trim()) return envSecret;
  const g = global as unknown as { __hl_ephemeral_secret?: string };
  if (!g.__hl_ephemeral_secret) {
    g.__hl_ephemeral_secret = crypto.randomBytes(32).toString("hex");
  }
  return g.__hl_ephemeral_secret;
}

export async function POST(request: NextRequest) {
  try {
    type PhysicsData = {
      isValid?: boolean;
      baseSpeedMultiplier?: number;
      baseTurnSpeed?: number;
      frameTimeMs?: number;
      carScaleRatio?: number;
    };
    type AntiCheatSummary = {
      isValid?: boolean;
      completionPercentage?: number;
    };
    // For documentation and future ref only
    /* type EncodedBody = {
      version: number;
      encoded: string;
      powNonce: string;
      challenge?: string;
      signature?: string;
      physicsData?: PhysicsData | null;
      antiCheatSummary?: AntiCheatSummary | null;
    }; */
    /* type LegacyBody = {
      bestLap?: unknown;
      driverName?: unknown;
      trackName?: unknown;
      physicsData?: PhysicsData | null;
      antiCheatSummary?: AntiCheatSummary | null;
    }; */

    const rawBody: unknown = await request.json().catch(() => null);
    const isObjectLike = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
    if (!isObjectLike(rawBody)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // New encoded submission format with lightweight PoW
    const obj = rawBody as Record<string, unknown>;
    const version = typeof obj.version === "number" ? obj.version : 0;
    const encoded = typeof obj.encoded === "string" ? obj.encoded : "";
    const powNonce = typeof obj.powNonce === "string" ? obj.powNonce : "";
    const challenge = typeof obj.challenge === "string" ? obj.challenge : "";
    const signature = typeof obj.signature === "string" ? obj.signature : "";
    const physicsData: PhysicsData | null = isObjectLike(obj.physicsData) ? (obj.physicsData as PhysicsData) : null;
    const antiCheatSummary: AntiCheatSummary | null = isObjectLike(obj.antiCheatSummary) ? (obj.antiCheatSummary as AntiCheatSummary) : null;
    const bestLapTrace: unknown = (obj as Record<string, unknown>).bestLapTrace ?? null;
    // Validate that bestLapTrace is a valid JSON value or null
    const validatedBestLapTrace = bestLapTrace !== null && typeof bestLapTrace === 'object' ? bestLapTrace : null;

    let bestLap = null as number | null;
    let driverName = "";
    let trackName = "";
    let clientIp = "";
    if (encoded && version === 1) {
      // Rate limit per IP
      const ip = getClientIp(request);
      clientIp = ip;

      // Check if IP is banned
      if (await isIpBanned(ip)) {
        return NextResponse.json({ error: "Sure buddy, nice try!" }, { status: 429 });
      }

      if (!rateLimit(ip, submitRateWindowMs, submitMaxRequests, submitBuckets)) {
        return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      }

      // Verify challenge presence
      if (!challenge || !signature) {
        return NextResponse.json({ error: "Missing challenge" }, { status: 400 });
      }
      // Verify HMAC signature
      const secret = getSecret();
      const expectedSig = hmacSHA256Hex(secret, challenge);
      if (!crypto.timingSafeEqual(Buffer.from(expectedSig, "hex"), Buffer.from(signature, "hex"))) {
        return NextResponse.json({ error: "Invalid challenge signature" }, { status: 400 });
      }
      // Decode and validate challenge payload
      let payload: { session: string; uaHash: string; issuedAt: number; expiresAt: number; powPrefix: string };
      try {
        const jsonStr = Buffer.from(challenge, "base64").toString("utf8");
        payload = JSON.parse(jsonStr);
      } catch {
        return NextResponse.json({ error: "Invalid challenge payload" }, { status: 400 });
      }
      const now = Date.now();
      if (!payload || typeof payload !== "object" || !payload.session || !payload.uaHash || !payload.powPrefix) {
        return NextResponse.json({ error: "Malformed challenge" }, { status: 400 });
      }
      if (typeof payload.expiresAt !== "number" || now > payload.expiresAt) {
        return NextResponse.json({ error: "Expired challenge" }, { status: 400 });
      }
      // Verify cookie-bound session
      const cookieSession = request.cookies.get("hl_session")?.value || "";
      if (!cookieSession || cookieSession !== payload.session) {
        return NextResponse.json({ error: "Session mismatch" }, { status: 400 });
      }
      // Verify UA binding
      const ua = request.headers.get("user-agent") || "";
      const uaHash = sha256Hex(ua);
      if (uaHash !== payload.uaHash) {
        return NextResponse.json({ error: "UA mismatch" }, { status: 400 });
      }
      // Verify stronger PoW using prefix from challenge (e.g., '0000')
      try {
        const powHash = sha256Hex(`${encoded}:${powNonce}`);
        if (!powHash.startsWith(payload.powPrefix)) {
          return NextResponse.json({ error: "Invalid PoW" }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: "PoW verification failed" }, { status: 400 });
      }

      // Decode base64 JSON
      try {
        const jsonStr = Buffer.from(encoded, 'base64').toString('utf8');
        const parsed = JSON.parse(jsonStr) as { bestLap: unknown; driverName: unknown; trackName: unknown; ts?: unknown };
        bestLap = typeof parsed.bestLap === 'number' ? parsed.bestLap : null;
        driverName = typeof parsed.driverName === 'string' ? parsed.driverName.trim() : '';
        trackName = typeof parsed.trackName === 'string' ? parsed.trackName.trim() : '';
        const ts = typeof parsed.ts === 'number' ? parsed.ts : 0;
        if (!ts || Math.abs(Date.now() - ts) > 5 * 60 * 1000) { // 5 minutes skew window
          return NextResponse.json({ error: "Stale or invalid timestamp" }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: "Invalid encoded payload" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Encoded submission required" }, { status: 400 });
    }

    if (bestLap === null || !driverName || !trackName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Constrain driver and track formats
    const name = driverName.trim();
    if (name.length < 1 || name.length > 30) {
      return NextResponse.json({ error: "Invalid driverName" }, { status: 400 });
    }
    if (!/^Track\s+\d+$/.test(trackName)) {
      return NextResponse.json({ error: "Invalid trackName" }, { status: 400 });
    }

    if (!antiCheatSummary || antiCheatSummary.isValid !== true) {
      return NextResponse.json({ error: "Anti-cheat validation required" }, { status: 400 });
    }

    // Basic plausibility checks to deter trivial cheating from console/API
    //  - enforce physics validation
    //  - require at least 70% checkpoint completion when provided
    //  - constrain lap time to sane bounds (5s .. 10m)
    if (!physicsData || physicsData.isValid !== true) {
      return NextResponse.json({ error: "Physics validation required" }, { status: 400 });
    }
    // if (typeof antiCheatSummary.completionPercentage !== "number" || antiCheatSummary.completionPercentage < 70) {
    //   return NextResponse.json({ error: "Insufficient checkpoint completion" }, { status: 400 });
    // }
    // if (!Number.isFinite(bestLap) || bestLap < 5 || bestLap > 600) {
    //   return NextResponse.json({ error: "Implausible lap time" }, { status: 400 });
    // }

    // Physics sanity checks (values are expected constants; allow small tolerance)
    const within = (a: unknown, b: number, tol: number) => typeof a === "number" && Math.abs(a - b) <= tol;
    if (!physicsData || physicsData.isValid !== true) {
      return NextResponse.json({ error: "Physics validation required" }, { status: 400 });
    }
    // baseTurnSpeed now contains attempt count instead of physics constant
    const baseTurnSpeedIsValidAttempts = typeof physicsData.baseTurnSpeed === "number" &&
      Number.isInteger(physicsData.baseTurnSpeed) &&
      physicsData.baseTurnSpeed > 0 &&
      physicsData.baseTurnSpeed <= 1000; // reasonable upper bound

    const okPhysics =
      within(physicsData.baseSpeedMultiplier, 1.82, 0.02) &&
      baseTurnSpeedIsValidAttempts &&
      within(physicsData.frameTimeMs, 16.67, 1) &&
      within(physicsData.carScaleRatio, 2.78, 0.1);
    if (!okPhysics) {
      return NextResponse.json({ error: "Physics mismatch" }, { status: 400 });
    }

    // Create the best lap record using Prisma
    try {
      const createdLap = await prisma.bestLap.create({
        data: {
          bestLap: bestLap,
          driverName: driverName,
          trackName: trackName,
          physicsValidationPassed: physicsData ? !!physicsData.isValid : false,
          baseSpeedMultiplier: physicsData ? physicsData.baseSpeedMultiplier ?? null : null,
          baseTurnSpeed: physicsData ? physicsData.baseTurnSpeed ?? null : null,
          frameTimeMs: physicsData ? physicsData.frameTimeMs ?? null : null,
          carScaleRatio: physicsData ? physicsData.carScaleRatio ?? null : null,
          bestLapTrace: validatedBestLapTrace ?? undefined,
          clientIp: clientIp,
        },
      });

      return NextResponse.json({ success: true, raceId: createdLap.id });
    } catch (error: unknown) {
      // Handle duplicate key constraint or other database errors
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return NextResponse.json({ success: false, reason: "duplicate" }, { status: 409 });
      }
      
      console.error('Database error:', error);
      const errorMessage = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' 
        ? error.message 
        : 'Unknown database error';
      return NextResponse.json(
        { error: "Database error", details: errorMessage },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}


