import type { PrismaClient } from "@prisma/client";
import { createMemoryClient } from "./db/memoryClient";

/**
 * Pluggable data client.
 *
 * Every API route imports `prisma` from here. By default the app uses an
 * in-memory backend (see ./db/memoryClient) so it runs with zero setup —
 * no Postgres, no DATABASE_URL required. Point it at a real database by
 * setting `DATABASE_URL` (and optionally `DB_BACKEND=postgres`).
 *
 *   DB_BACKEND=memory     -> in-memory store (default when no DATABASE_URL)
 *   DB_BACKEND=postgres   -> Prisma + PostgreSQL (default when DATABASE_URL is set)
 */
type Backend = "memory" | "postgres";

function resolveBackend(): Backend {
  const explicit = (process.env.DB_BACKEND || "").toLowerCase();
  if (explicit === "memory") return "memory";
  if (["postgres", "postgresql", "prisma"].includes(explicit)) return "postgres";
  return process.env.DATABASE_URL ? "postgres" : "memory";
}

function createClient(): PrismaClient {
  if (resolveBackend() === "postgres") {
    // Lazy require so the in-memory default never needs a live DB connection.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@prisma/client") as typeof import("@prisma/client");
    return new mod.PrismaClient();
  }
  return createMemoryClient() as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
