"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LeaderRow = { driverName: string; bestLap: number; raceId: string };
type PageData = { rows: LeaderRow[]; startRank: number; total: number; myRank: number };

const WINDOW_SIZE = 10;
const STEP_SIZE = 5;
const MIN_DATE = "2025-08-01";

function todayUTC(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function dateToTrackId(dateStr: string): number {
  const baseMs = Date.UTC(2025, 4, 15); // 2025-05-15
  const d = new Date(dateStr + "T12:00:00Z");
  const dayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return 101 + Math.floor((dayMs - baseMs) / 86400000);
}

function formatDateLabel(dateStr: string): string {
  const today = todayUTC();
  if (dateStr === today) return "today";
  const yesterday = shiftDate(today, -1);
  if (dateStr === yesterday) return "yesterday";
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatSeconds(secondsValue: number): string {
  if (!Number.isFinite(secondsValue)) return "-";
  const totalMs = Math.max(0, Math.round(secondsValue * 1000));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export default function GlobalLeaderboardPage() {
  const [pageData, setPageData] = useState<PageData>({ rows: [], startRank: 1, total: 0, myRank: -1 });
  const [offset, setOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(todayUTC);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"top10" | "personal">(() => {
    try {
      const saved = localStorage.getItem("hotlapdaily_player_name");
      if (saved && saved.trim()) return "personal";
    } catch {}
    return "top10";
  });

  // Cache: offset -> PageData
  const cache = useRef<Map<string, PageData>>(new Map());

  const fetchPage = useCallback(async (v: typeof view, o: number, date: string) => {
    const key = `${v}:${o}:${date}`;
    const cached = cache.current.get(key);
    if (cached) {
      setPageData(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let playerNameLocal = "";
      try {
        const saved = localStorage.getItem("hotlapdaily_player_name");
        if (saved) playerNameLocal = saved.trim();
      } catch {}

      const params = new URLSearchParams();
      params.set("date", date);
      params.set("limit", String(WINDOW_SIZE));

      // Personal view initial load: use server-side windowing around the driver.
      // All other cases (top10, or personal with offset after init): use offset pagination.
      if (v === "personal" && playerNameLocal && o === 0 && !initializedPersonalOffset.current) {
        params.set("driverName", playerNameLocal);
      } else if (o > 0) {
        params.set("offset", String(o));
      }

      const url = `/api/global-leaderboard?${params.toString()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const result: PageData = {
        rows: Array.isArray(data.leaderboard) ? data.leaderboard : [],
        startRank: typeof data.startRank === "number" ? data.startRank : 1,
        total: typeof data.total === "number" ? data.total : 0,
        myRank: typeof data.myRank === "number" ? data.myRank : -1,
      };

      cache.current.set(key, result);
      setPageData(result);
      setError(null);
    } catch {
      setError("Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset cache and offset when view or date changes
  useEffect(() => {
    cache.current.clear();
    setOffset(0);
    fetchPage(view, 0, selectedDate);
  }, [view, selectedDate, fetchPage]);

  // Fetch when offset changes
  useEffect(() => {
    fetchPage(view, offset, selectedDate);
  }, [offset, view, selectedDate, fetchPage]);

  const playerName = useMemo(() => {
    try {
      const saved = localStorage.getItem("hotlapdaily_player_name");
      return saved ? saved.trim() : "";
    } catch {
      return "";
    }
  }, []);

  const { rows, startRank, total, myRank: serverMyRank } = pageData;

  const myRank = useMemo(() => {
    if (typeof serverMyRank === "number" && serverMyRank > 0) return serverMyRank;
    if (!playerName) return -1;
    const idx = rows.findIndex(r => r.driverName.toLowerCase() === playerName.toLowerCase());
    return idx >= 0 ? (startRank + idx) : -1;
  }, [rows, playerName, serverMyRank, startRank]);

  const displayRows = useMemo(() => {
    return rows.map((r, i) => ({ rank: startRank + i, ...r }));
  }, [rows, startRank]);

  // For personal view initial load, sync offset from server's startRank
  const initializedPersonalOffset = useRef(false);
  useEffect(() => {
    if (view === "personal" && serverMyRank > 0 && !initializedPersonalOffset.current) {
      initializedPersonalOffset.current = true;
      setOffset(startRank - 1);
    }
  }, [view, serverMyRank, startRank]);
  // Reset the flag when view changes
  useEffect(() => {
    initializedPersonalOffset.current = false;
  }, [view, selectedDate]);

  const canPrev = offset > 0;
  const canNext = offset + WINDOW_SIZE < total;

  return (
    <>
      <div className="game-container leaderboard-page" style={{ height: "auto", minHeight: "100vh", overflow: "visible" }}>
        <div className="pixel-title-box" style={{margin: "0 25px"}}><h1 className="fade-in pixel-title-text">GLOBAL LEADERBOARD</h1></div>
        <p className="tagline fade-in" style={{margin: "0 25px"}}>{formatDateLabel(selectedDate)}&apos;s fastest drivers</p>

        <div className="game-ui fade-in" style={{ maxWidth: 640, margin: "0 auto", gridTemplateColumns: "1fr", height: "auto", maxHeight: "none", overflow: "visible" }}>
          {/* Date selector */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontFamily: "'IBM Plex Mono', monospace",
            marginBottom: 4,
          }}>
            <button
              className="pixel-button"
              disabled={selectedDate <= MIN_DATE}
              onClick={() => setSelectedDate(d => shiftDate(d, -1))}
              style={{ width: "auto", minWidth: 36, padding: "0.3rem 0.5rem", opacity: selectedDate <= MIN_DATE ? 0.3 : 1 }}
            >&lt;</button>
            <input
              type="date"
              value={selectedDate}
              min={MIN_DATE}
              max={todayUTC()}
              onChange={e => {
                const v = e.target.value;
                if (v >= MIN_DATE && v <= todayUTC()) setSelectedDate(v);
              }}
              style={{
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                border: "2px solid var(--border)",
                borderRadius: 0,
                padding: "0.3rem 0.5rem",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "0.8rem",
                fontWeight: 600,
              }}
            />
            <button
              className="pixel-button"
              disabled={selectedDate >= todayUTC()}
              onClick={() => setSelectedDate(d => shiftDate(d, 1))}
              style={{ width: "auto", minWidth: 36, padding: "0.3rem 0.5rem", opacity: selectedDate >= todayUTC() ? 0.3 : 1 }}
            >&gt;</button>
          </div>
          {loading && <div style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Loading…</div>}
          {error && <div style={{ color: "var(--text-primary)", fontFamily: "'IBM Plex Mono', monospace" }}>{error}</div>}
          {!loading && !error && (
            <div style={{ background: "var(--bg-primary)", border: "2px solid var(--border)", borderRadius: 10, padding: 12, flex: 1 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {displayRows.map(row => {
                    const isMe = myRank === row.rank;
                    return (
                      <div
                        key={`${row.rank}-${row.driverName}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "8px 12px",
                          border: "2px solid var(--border)",
                          borderRadius: 8,
                          background: isMe ? "var(--accent)" : "var(--bg-primary)",
                          color: isMe ? "var(--bg-primary)" : "var(--text-primary)",
                          fontFamily: "'IBM Plex Mono', monospace"
                        }}
                      >
                        <div style={{
                          minWidth: 48,
                          textAlign: "center",
                          fontWeight: 700
                        }}>{`#${row.rank}`}</div>
                        <div style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.driverName}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ opacity: isMe ? 0.9 : 0.7 }}>{formatSeconds(row.bestLap)}</div>
                          <div
                            onClick={() => {
                              const isToday = selectedDate === todayUTC();
                              const trackParam = isToday ? "" : `&trackId=${dateToTrackId(selectedDate)}`;
                              window.location.href = `/?raceId=${row.raceId}${trackParam}`;
                            }}
                            style={{
                              width: "32px",
                              height: "32px",
                              cursor: "pointer",
                              border: isMe ? "1px solid #fff" : "1px solid #111",
                              borderRadius: "4px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "16px",
                              background: isMe ? "#111" : "#fff",
                              color: isMe ? "#fff" : "#111",
                              transition: "all 0.2s ease"
                            }}
                            title="Load Ghost Car"
                          >
                            🏁
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination (top10 view only) */}
                {total > WINDOW_SIZE && (
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 12,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: "0.8rem",
                  }}>
                    <button
                      className="pixel-button"
                      disabled={!canPrev}
                      onClick={() => setOffset(o => Math.max(0, o - STEP_SIZE))}
                      style={{ width: "auto", minWidth: 80, opacity: canPrev ? 1 : 0.3 }}
                    >
                      PREV
                    </button>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {offset + 1}–{Math.min(offset + WINDOW_SIZE, total)}
                    </span>
                    <button
                      className="pixel-button"
                      disabled={!canNext}
                      onClick={() => setOffset(o => o + STEP_SIZE)}
                      style={{ width: "auto", minWidth: 80, opacity: canNext ? 1 : 0.3 }}
                    >
                      NEXT
                    </button>
                  </div>
                )}

                {myRank !== -1 && (
                  <div style={{ marginTop: 12, fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-secondary)" }}>
                    You are currently ranked #{myRank}
                  </div>
                )}
                {/* Bottom toggle button - show only if we have a saved player name */}
                {playerName && (
                  <button
                    className="pixel-button"
                    style={{ display: "inline-block", marginTop: 12 }}
                    onClick={() => {
                      setView(prev => {
                        if (prev === "top10") {
                          try {
                            const saved = localStorage.getItem("hotlapdaily_player_name");
                            if (saved && saved.trim()) return "personal";
                          } catch {}
                          return "top10";
                        }
                        return "top10";
                      });
                    }}
                  >
                    {view === "top10" ? `Show current ranking (${playerName})` : "Check Top 10"}
                  </button>
                )}
              </div>
            )}
        </div>
      </div>
    </>
  );
}
