// IP blocklist used to filter out abusive clients from leaderboards and lap
// submissions. Stored in the `banned_ips` table and read through the pluggable
// data client, so it works with both the in-memory and PostgreSQL backends.
//
// Results are cached in-process for a short TTL to avoid a DB round-trip on
// every request. Add entries with `prisma.bannedIp.create({ data: { ip } })`
// or directly in the database.
import { prisma } from "./prisma";

const CACHE_TTL_MS = 60_000;
let cache: { ips: string[]; at: number } | null = null;

/** Returns the current list of banned IPs (cached for CACHE_TTL_MS). */
export async function getBannedIps(): Promise<string[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.ips;
  try {
    const rows = await prisma.bannedIp.findMany({ select: { ip: true } });
    const ips = rows.map((r) => r.ip);
    cache = { ips, at: now };
    return ips;
  } catch {
    // If the table is missing or the DB is unreachable, fail open with the last
    // known list (or empty) rather than blocking all traffic.
    return cache?.ips ?? [];
  }
}

/** True if the given IP is on the blocklist. */
export async function isIpBanned(ip: string): Promise<boolean> {
  const ips = await getBannedIps();
  return ips.includes(ip);
}
