/**
 * In-memory data backend.
 *
 * This implements the subset of the Prisma Client delegate API that the app's
 * API routes actually use, so the whole app can run with zero external setup
 * (no Postgres, no DATABASE_URL). It is selected by default in `@/lib/prisma`
 * and can be swapped for the real Prisma/Postgres client via `DB_BACKEND` env.
 *
 * Supported per-model operations: create, createMany, findUnique, findFirst,
 * findMany, count, update, upsert, delete, deleteMany.
 *
 * Supported `where` operators: bare equality, equals, not, in, notIn,
 * gt/gte/lt/lte, contains, and `mode: "insensitive"` for string compares.
 * Compound unique keys (e.g. `year_username`) are supported. An `undefined`
 * filter value is treated as "no filter", matching Prisma's behaviour.
 *
 * Data optionally persists to `.data/hotlap-db.json` (set DB_PERSIST=false to
 * disable) so a local leaderboard survives dev-server restarts.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

type Row = Record<string, unknown>;
type Order = "asc" | "desc";

const OPERATOR_KEYS = new Set([
  "equals",
  "not",
  "in",
  "notIn",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "startsWith",
  "endsWith",
  "mode",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date)
  );
}

function isOperatorObject(v: unknown): v is Record<string, unknown> {
  return (
    isPlainObject(v) && Object.keys(v).some((k) => OPERATOR_KEYS.has(k))
  );
}

/** Compare two scalar values; returns negative / 0 / positive. */
function compare(a: unknown, b: unknown): number {
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : Number(a);
    const tb = b instanceof Date ? b.getTime() : Number(b);
    return ta - tb;
  }
  if (typeof a === "bigint" || typeof b === "bigint") {
    const ba = BigInt(a as never);
    const bb = BigInt(b as never);
    return ba < bb ? -1 : ba > bb ? 1 : 0;
  }
  if (typeof a === "number" || typeof b === "number") {
    return Number(a) - Number(b);
  }
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function equals(a: unknown, b: unknown, insensitive: boolean): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === "bigint" || typeof b === "bigint") {
    try {
      return BigInt(a as never) === BigInt(b as never);
    } catch {
      return false;
    }
  }
  if (insensitive && typeof a === "string" && typeof b === "string") {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

function fieldMatches(value: unknown, condition: unknown): boolean {
  if (condition === undefined) return true; // Prisma: undefined => skip filter
  if (!isOperatorObject(condition)) {
    return equals(value, condition, false);
  }
  const cond = condition as Record<string, unknown>;
  const insensitive = cond.mode === "insensitive";

  if ("equals" in cond && cond.equals !== undefined) {
    if (!equals(value, cond.equals, insensitive)) return false;
  }
  if ("not" in cond && cond.not !== undefined) {
    if (equals(value, cond.not, insensitive)) return false;
  }
  if ("in" in cond && Array.isArray(cond.in)) {
    if (value == null) return false;
    if (!cond.in.some((x) => equals(value, x, insensitive))) return false;
  }
  if ("notIn" in cond && Array.isArray(cond.notIn)) {
    // Keep rows whose value is null/undefined (matches the intent of an
    // exclusion list) and rows not present in the list.
    if (value != null && cond.notIn.some((x) => equals(value, x, insensitive))) {
      return false;
    }
  }
  if ("gt" in cond && cond.gt !== undefined) {
    if (value == null || compare(value, cond.gt) <= 0) return false;
  }
  if ("gte" in cond && cond.gte !== undefined) {
    if (value == null || compare(value, cond.gte) < 0) return false;
  }
  if ("lt" in cond && cond.lt !== undefined) {
    if (value == null || compare(value, cond.lt) >= 0) return false;
  }
  if ("lte" in cond && cond.lte !== undefined) {
    if (value == null || compare(value, cond.lte) > 0) return false;
  }
  if ("contains" in cond && typeof cond.contains === "string") {
    const hay = String(value ?? "");
    const needle = cond.contains;
    if (insensitive) {
      if (!hay.toLowerCase().includes(needle.toLowerCase())) return false;
    } else if (!hay.includes(needle)) {
      return false;
    }
  }
  return true;
}

function matchWhere(
  row: Row,
  where: Record<string, unknown> | undefined,
  fields: Set<string>
): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (fields.has(key)) {
      if (!fieldMatches(row[key], cond)) return false;
      continue;
    }
    // Compound unique key, e.g. { year_username: { year, username } }
    if (isPlainObject(cond)) {
      for (const [k, v] of Object.entries(cond)) {
        if (!equals(row[k], v, false)) return false;
      }
    }
  }
  return true;
}

function applyOrder(rows: Row[], orderBy?: Record<string, Order>): Row[] {
  if (!orderBy) return rows;
  const [field, dir] = Object.entries(orderBy)[0] ?? [];
  if (!field) return rows;
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => sign * compare(a[field], b[field]));
}

function project(row: Row, select?: Record<string, boolean>): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [key, want] of Object.entries(select)) {
    if (want) out[key] = row[key];
  }
  return out;
}

interface ModelSpec {
  /** Scalar field names (used to distinguish fields from compound keys). */
  fields: string[];
  /** Build a stored row from `create` input, applying ids/defaults. */
  instantiate: (data: Row, nextAutoId: () => bigint) => Row;
}

const NOW = () => new Date();

const MODELS: Record<string, ModelSpec> = {
  bestLap: {
    fields: [
      "id",
      "driverName",
      "bestLap",
      "trackName",
      "createdAt",
      "physicsValidationPassed",
      "baseSpeedMultiplier",
      "baseTurnSpeed",
      "frameTimeMs",
      "carScaleRatio",
      "bestLapTrace",
      "clientIp",
      "valid",
    ],
    instantiate: (d) => ({
      id: crypto.randomUUID(),
      driverName: d.driverName ?? "",
      bestLap: d.bestLap == null ? null : Number(d.bestLap),
      trackName: d.trackName ?? null,
      createdAt: (d.createdAt as Date) ?? NOW(),
      physicsValidationPassed: d.physicsValidationPassed ?? false,
      baseSpeedMultiplier: d.baseSpeedMultiplier ?? null,
      baseTurnSpeed: d.baseTurnSpeed ?? null,
      frameTimeMs: d.frameTimeMs ?? null,
      carScaleRatio: d.carScaleRatio ?? null,
      bestLapTrace: d.bestLapTrace ?? null,
      clientIp: d.clientIp ?? null,
      valid: d.valid ?? true,
    }),
  },
  submittedTrack: {
    fields: ["id", "name", "trackCode", "createdAt"],
    instantiate: (d, nextAutoId) => ({
      id: nextAutoId(),
      name: d.name ?? "",
      trackCode: d.trackCode ?? "",
      createdAt: (d.createdAt as Date) ?? NOW(),
    }),
  },
  trackFunction: {
    fields: ["id", "trackId", "trackFunction", "createdAt"],
    instantiate: (d) => ({
      id: crypto.randomUUID(),
      trackId: Number(d.trackId),
      trackFunction: d.trackFunction ?? "",
      createdAt: (d.createdAt as Date) ?? NOW(),
    }),
  },
  wrapped: {
    fields: ["id", "year", "username", "dataJson", "createdAt"],
    instantiate: (d) => ({
      id: crypto.randomUUID(),
      year: Number(d.year),
      username: d.username ?? "",
      dataJson: d.dataJson ?? null,
      createdAt: (d.createdAt as Date) ?? NOW(),
    }),
  },
  feedback: {
    fields: ["id", "ip", "message", "createdAt"],
    instantiate: (d) => ({
      id: crypto.randomUUID(),
      ip: d.ip ?? "",
      message: d.message ?? "",
      createdAt: (d.createdAt as Date) ?? NOW(),
    }),
  },
  bannedIp: {
    fields: ["id", "ip", "reason", "createdAt"],
    instantiate: (d) => ({
      id: crypto.randomUUID(),
      ip: d.ip ?? "",
      reason: d.reason ?? null,
      createdAt: (d.createdAt as Date) ?? NOW(),
    }),
  },
};

class NotFoundError extends Error {
  code = "P2025";
  constructor() {
    super("An operation failed because it depends on one or more records that were required but not found.");
  }
}

// --- Optional JSON-file persistence -----------------------------------------

const PERSIST = process.env.DB_PERSIST !== "false";
const DATA_FILE = path.join(process.cwd(), ".data", "hotlap-db.json");

function jsonReplacer(this: Row, key: string): unknown {
  const orig = this[key];
  if (orig instanceof Date) return { __t: "date", v: orig.toISOString() };
  const value = (this as Record<string, unknown>)[key];
  if (typeof value === "bigint") return { __t: "bigint", v: value.toString() };
  return value;
}

function jsonReviver(_key: string, value: unknown): unknown {
  if (isPlainObject(value) && "__t" in value) {
    if (value.__t === "date") return new Date(value.v as string);
    if (value.__t === "bigint") return BigInt(value.v as string);
  }
  return value;
}

function loadFromDisk(): Record<string, Row[]> | null {
  if (!PERSIST) return null;
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw, jsonReviver);
  } catch {
    return null;
  }
}

function saveToDisk(tables: Record<string, Row[]>): void {
  if (!PERSIST) return;
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(tables, jsonReplacer, 0));
  } catch {
    // best-effort; ignore persistence failures in local dev
  }
}

// --- Client factory ----------------------------------------------------------

export function createMemoryClient() {
  const tables: Record<string, Row[]> = {};
  const autoCounters: Record<string, bigint> = {};

  const loaded = loadFromDisk();
  for (const model of Object.keys(MODELS)) {
    tables[model] = loaded?.[model] ?? [];
    // Seed autoincrement counter past the largest existing bigint id.
    let max = BigInt(0);
    for (const row of tables[model]) {
      if (typeof row.id === "bigint" && row.id > max) max = row.id;
    }
    autoCounters[model] = max;
  }

  const persist = () => saveToDisk(tables);

  function makeDelegate(modelName: string) {
    const spec = MODELS[modelName];
    const fields = new Set(spec.fields);
    const rows = () => tables[modelName];
    const nextAutoId = () => {
      autoCounters[modelName] += BigInt(1);
      return autoCounters[modelName];
    };

    type Args = {
      where?: Record<string, unknown>;
      select?: Record<string, boolean>;
      orderBy?: Record<string, Order>;
      take?: number;
      skip?: number;
      data?: Row;
      create?: Row;
      update?: Row;
    };

    return {
      async create({ data, select }: Args) {
        const row = spec.instantiate(data ?? {}, nextAutoId);
        rows().push(row);
        persist();
        return project(row, select);
      },
      async createMany({ data, skipDuplicates }: { data: Row[]; skipDuplicates?: boolean }) {
        let count = 0;
        for (const d of data) {
          if (skipDuplicates && modelName === "trackFunction") {
            const exists = rows().some((r) => equals(r.trackId, Number(d.trackId), false));
            if (exists) continue;
          }
          rows().push(spec.instantiate(d, nextAutoId));
          count++;
        }
        persist();
        return { count };
      },
      async findUnique({ where, select }: Args) {
        const row = rows().find((r) => matchWhere(r, where, fields));
        return row ? project(row, select) : null;
      },
      async findFirst({ where, select, orderBy, take }: Args) {
        let result = rows().filter((r) => matchWhere(r, where, fields));
        result = applyOrder(result, orderBy);
        if (typeof take === "number") result = result.slice(0, take);
        const row = result[0];
        return row ? project(row, select) : null;
      },
      async findMany({ where, select, orderBy, take, skip }: Args) {
        let result = rows().filter((r) => matchWhere(r, where, fields));
        result = applyOrder(result, orderBy);
        if (typeof skip === "number") result = result.slice(skip);
        if (typeof take === "number") result = result.slice(0, take);
        return result.map((r) => project(r, select));
      },
      async count({ where }: Args = {}) {
        return rows().filter((r) => matchWhere(r, where, fields)).length;
      },
      async update({ where, data, select }: Args) {
        const row = rows().find((r) => matchWhere(r, where, fields));
        if (!row) throw new NotFoundError();
        Object.assign(row, data);
        persist();
        return project(row, select);
      },
      async upsert({ where, create, update, select }: Args) {
        const existing = rows().find((r) => matchWhere(r, where, fields));
        if (existing) {
          Object.assign(existing, update);
          persist();
          return project(existing, select);
        }
        const row = spec.instantiate(create ?? {}, nextAutoId);
        rows().push(row);
        persist();
        return project(row, select);
      },
      async delete({ where, select }: Args) {
        const idx = rows().findIndex((r) => matchWhere(r, where, fields));
        if (idx < 0) throw new NotFoundError();
        const [row] = rows().splice(idx, 1);
        persist();
        return project(row, select);
      },
      async deleteMany({ where }: Args) {
        const before = rows().length;
        tables[modelName] = rows().filter((r) => !matchWhere(r, where, fields));
        persist();
        return { count: before - tables[modelName].length };
      },
    };
  }

  return {
    bestLap: makeDelegate("bestLap"),
    submittedTrack: makeDelegate("submittedTrack"),
    trackFunction: makeDelegate("trackFunction"),
    wrapped: makeDelegate("wrapped"),
    feedback: makeDelegate("feedback"),
    bannedIp: makeDelegate("bannedIp"),
    async $connect() {},
    async $disconnect() {},
    $queryRaw() {
      throw new Error(
        "The in-memory DB backend does not support $queryRaw. Set DB_BACKEND=postgres (with DATABASE_URL) to use raw SQL."
      );
    },
  };
}

export type MemoryClient = ReturnType<typeof createMemoryClient>;
