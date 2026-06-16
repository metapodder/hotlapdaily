"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./dashboard.css";

interface PendingTrack {
  id: string;
  name: string;
  trackCode: string;
  createdAt: string;
  pendingCount: number;
}

interface ViewedTrack {
  trackId: number;
  date: string;
  exists: boolean;
  trackCode: string | null;
  createdAt?: string;
}

function renderTrackOnCanvas(canvas: HTMLCanvasElement, trackCode: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  let checkpoints: { x: number; y: number; angle?: number }[];
  try {
    const func = new Function("return " + trackCode)();
    if (typeof func !== "function") return;
    const scale = 1;
    const centerX = width / 2;
    const centerY = height / 2;
    checkpoints = func(scale, centerX, centerY);
    if (!Array.isArray(checkpoints) || checkpoints.length < 2) return;
  } catch {
    return;
  }

  const trackWidth = 30;
  ctx.strokeStyle = "#333";
  ctx.lineWidth = trackWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(checkpoints[0].x, checkpoints[0].y);
  for (let i = 1; i < checkpoints.length; i++) {
    ctx.lineTo(checkpoints[i].x, checkpoints[i].y);
  }
  ctx.stroke();

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = trackWidth + 4;
  ctx.globalCompositeOperation = "destination-over";
  ctx.beginPath();
  ctx.moveTo(checkpoints[0].x, checkpoints[0].y);
  for (let i = 1; i < checkpoints.length; i++) {
    ctx.lineTo(checkpoints[i].x, checkpoints[i].y);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";

  ctx.strokeStyle = "#666";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(checkpoints[0].x, checkpoints[0].y);
  for (let i = 1; i < checkpoints.length; i++) {
    ctx.lineTo(checkpoints[i].x, checkpoints[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, i === 0 ? 6 : 3, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? "#e74c3c" : "#3498db";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  if (checkpoints[0].angle !== undefined) {
    const start = checkpoints[0];
    const angle = (start.angle! * Math.PI) / 180;
    const arrowLen = 18;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(
      start.x + Math.cos(angle) * arrowLen,
      start.y + Math.sin(angle) * arrowLen
    );
    ctx.strokeStyle = "#e74c3c";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}

// ---- Login Screen ----
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onLogin();
      } else {
        const data = await res.json();
        setError(data.error || "Wrong password");
      }
    } catch {
      setError("Connection error");
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="pixel-title-text" style={{ fontSize: 28 }}>
          DASHBOARD
        </h1>
        <p className="login-subtitle">Enter admin password</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            className="login-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
          />
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "..." : "ENTER"}
          </button>
        </form>
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}

// ---- Tab: Review Tracks ----
function ReviewTab() {
  const [track, setTrack] = useState<PendingTrack | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadTrack = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setDone(false);
    try {
      const res = await fetch("/api/dashboard?action=random");
      if (res.status === 404) {
        setTrack(null);
        setDone(true);
        setMessage("No more tracks to review!");
        setLoading(false);
        return;
      }
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setTrack(data);
    } catch {
      setMessage("Failed to load track");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTrack();
  }, [loadTrack]);

  useEffect(() => {
    if (track && canvasRef.current) {
      renderTrackOnCanvas(canvasRef.current, track.trackCode);
    }
  }, [track]);

  const handleReview = async (approved: boolean) => {
    if (!track || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          submittedTrackId: track.id,
          approved,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      if (approved) {
        setMessage(`Approved! Track ${data.trackId} (${data.date})`);
      } else {
        setMessage("Rejected & removed");
      }

      setTimeout(() => loadTrack(), 800);
    } catch {
      setMessage("Error submitting review");
    }
    setSubmitting(false);
  };

  if (loading) return <div className="dashboard-loading">Loading track...</div>;
  if (done) return <div className="dashboard-done">{message}</div>;
  if (!track) return null;

  return (
    <div className="dashboard-card">
      <div className="dashboard-track-info">
        <span className="track-name">{track.name}</span>
        <span className="track-meta">
          ID: {track.id} &middot; {track.pendingCount} pending
        </span>
      </div>
      <div className="dashboard-canvas-wrapper">
        <canvas ref={canvasRef} className="dashboard-canvas" width={400} height={350} />
      </div>
      {message && (
        <div
          className={`dashboard-message ${
            message.includes("Approved") ? "approved" : message.includes("Rejected") ? "rejected" : ""
          }`}
        >
          {message}
        </div>
      )}
      <div className="dashboard-actions">
        <button 
          className="btn-review btn-play" 
          onClick={() => {
            localStorage.setItem('hotlapdaily_test_mode', 'true');
            localStorage.setItem('hotlapdaily_test_track_code', track.trackCode);
            window.open('/?testMode=true', '_blank');
          }}
          disabled={submitting}
        >
          PLAY
        </button>
        <button className="btn-review btn-no" onClick={() => handleReview(false)} disabled={submitting}>
          NO
        </button>
        <button className="btn-review btn-yes" onClick={() => handleReview(true)} disabled={submitting}>
          YES
        </button>
      </div>
    </div>
  );
}

// ---- Submitted Track Browser ----
interface BrowseTrack {
  id: string;
  name: string;
  trackCode: string;
}

function TrackBrowser({
  onSelect,
  targetTrackId,
}: {
  onSelect: (track: BrowseTrack) => void;
  targetTrackId: number;
}) {
  const [browseTrack, setBrowseTrack] = useState<BrowseTrack | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const browseCanvasRef = useRef<HTMLCanvasElement>(null);
  const [swapping, setSwapping] = useState(false);
  const [swapMsg, setSwapMsg] = useState("");

  const loadBrowse = useCallback(async (cursor?: string, dir?: string) => {
    setBrowseLoading(true);
    setSwapMsg("");
    let url = "/api/dashboard?action=browse";
    if (cursor) url += `&cursor=${cursor}&dir=${dir || "next"}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setBrowseTrack(data);
        setTotal(data.totalSubmitted);
      }
    } catch { /* */ }
    setBrowseLoading(false);
  }, []);

  useEffect(() => {
    loadBrowse();
  }, [loadBrowse]);

  useEffect(() => {
    if (browseTrack && browseCanvasRef.current) {
      renderTrackOnCanvas(browseCanvasRef.current, browseTrack.trackCode);
    }
  }, [browseTrack]);

  const handleSwap = async () => {
    if (!browseTrack) return;
    setSwapping(true);
    setSwapMsg("");
    try {
      const res = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change",
          trackId: targetTrackId,
          trackCode: browseTrack.trackCode,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSwapMsg(`Swapped! Track ${data.trackId} updated`);
        onSelect(browseTrack);
      } else {
        setSwapMsg(data.error || "Error");
      }
    } catch {
      setSwapMsg("Failed");
    }
    setSwapping(false);
  };

  if (!browseTrack && !browseLoading) return null;

  return (
    <div className="browser-section">
      <p className="change-label">Browse submitted tracks to swap in:</p>
      {browseLoading ? (
        <div className="browse-loading">Loading...</div>
      ) : browseTrack ? (
        <>
          <div className="browse-info">
            <span className="browse-name">{browseTrack.name}</span>
            <span className="browse-id">#{browseTrack.id} &middot; {total} total</span>
          </div>
          <div className="browse-canvas-wrapper">
            <canvas ref={browseCanvasRef} className="dashboard-canvas" width={400} height={300} />
          </div>
          <div className="browse-nav">
            <button
              className="nav-btn"
              onClick={() => loadBrowse(browseTrack.id, "prev")}
            >
              PREV
            </button>
            <button
              className="nav-btn random-btn"
              onClick={() => loadBrowse()}
            >
              RANDOM
            </button>
            <button
              className="nav-btn play-test-btn"
              style={{ background: '#3498db', color: '#fff' }}
              onClick={() => {
                localStorage.setItem('hotlapdaily_test_mode', 'true');
                localStorage.setItem('hotlapdaily_test_track_code', browseTrack.trackCode);
                window.open('/?testMode=true', '_blank');
              }}
            >
              PLAY
            </button>
            <button
              className="swap-btn"
              onClick={handleSwap}
              disabled={swapping}
            >
              {swapping ? "..." : "USE"}
            </button>
            <button
              className="nav-btn"
              onClick={() => loadBrowse(browseTrack.id, "next")}
            >
              NEXT
            </button>
          </div>
          {swapMsg && <div className="dashboard-message approved">{swapMsg}</div>}
        </>
      ) : null}
    </div>
  );
}

// ---- Direction Changer ----
function DirectionChanger({
  trackId,
  trackCode,
  mainCanvasRef,
  onChanged,
}: {
  trackId: number;
  trackCode: string;
  mainCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onChanged: () => void;
}) {
  const [angle, setAngle] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Extract current angle from track code
  useEffect(() => {
    const match = trackCode.match(/angle:\s*([\d.]+)/);
    if (match) {
      setAngle(Math.round(parseFloat(match[1])));
    }
  }, [trackCode]);

  // Update the main canvas live when angle changes
  useEffect(() => {
    if (!mainCanvasRef.current) return;
    const modifiedCode = trackCode.replace(
      /angle:\s*[\d.]+/,
      `angle: ${angle}`
    );
    renderTrackOnCanvas(mainCanvasRef.current, modifiedCode);
  }, [angle, trackCode, mainCanvasRef]);

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "changeDirection",
          trackId,
          angle,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`Direction updated to ${angle}°`);
        onChanged();
      } else {
        setMsg(data.error || "Error");
      }
    } catch {
      setMsg("Failed");
    }
    setSaving(false);
  };

  return (
    <div className="direction-section">
      <p className="change-label">Change direction:</p>
      <div className="direction-controls">
        <input
          type="range"
          min={0}
          max={359}
          value={angle}
          onChange={(e) => setAngle(parseInt(e.target.value))}
          className="direction-slider"
        />
        <div className="direction-value-row">
          <input
            type="number"
            min={0}
            max={359}
            value={angle}
            onChange={(e) => {
              let v = parseInt(e.target.value) || 0;
              if (v >= 360) v = 359;
              if (v < 0) v = 0;
              setAngle(v);
            }}
            className="direction-input"
          />
          <span className="direction-deg">°</span>
          <button
            className="direction-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "..." : "SAVE"}
          </button>
        </div>
      </div>
      {msg && <div className="dashboard-message approved">{msg}</div>}
    </div>
  );
}

// ---- Tab: View / Change Track ----
function ViewTab() {
  const [mode, setMode] = useState<"trackId" | "date">("date");
  const [inputValue, setInputValue] = useState("");
  const [viewedTrack, setViewedTrack] = useState<ViewedTrack | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [browserKey, setBrowserKey] = useState(0);

  const handleView = useCallback(async () => {
    if (!inputValue.trim()) return;
    setLoading(true);
    setMessage("");
    setViewedTrack(null);

    const param = mode === "trackId" ? `trackId=${inputValue}` : `date=${inputValue}`;
    try {
      const res = await fetch(`/api/dashboard?action=view&${param}`);
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Error");
      } else {
        setViewedTrack(data);
      }
    } catch {
      setMessage("Failed to fetch");
    }
    setLoading(false);
  }, [inputValue, mode]);

  useEffect(() => {
    if (viewedTrack?.trackCode && canvasRef.current) {
      renderTrackOnCanvas(canvasRef.current, viewedTrack.trackCode);
    }
  }, [viewedTrack]);

  // Set default date to today
  useEffect(() => {
    if (mode === "date" && !inputValue) {
      setInputValue(new Date().toISOString().split("T")[0]);
    }
  }, [mode, inputValue]);

  return (
    <div className="view-tab">
      <div className="view-controls">
        <div className="view-mode-toggle">
          <button
            className={`mode-btn ${mode === "date" ? "active" : ""}`}
            onClick={() => { setMode("date"); setInputValue(new Date().toISOString().split("T")[0]); setViewedTrack(null); }}
          >
            By Date
          </button>
          <button
            className={`mode-btn ${mode === "trackId" ? "active" : ""}`}
            onClick={() => { setMode("trackId"); setInputValue(""); setViewedTrack(null); }}
          >
            By Track ID
          </button>
        </div>
        <div className="view-input-row">
          <input
            type={mode === "date" ? "date" : "number"}
            className="view-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={mode === "date" ? "YYYY-MM-DD" : "Track ID"}
          />
          <button className="view-btn" onClick={handleView} disabled={loading}>
            {loading ? "..." : "VIEW"}
          </button>
        </div>
      </div>

      {message && <div className="dashboard-message">{message}</div>}

      {viewedTrack && (
        <div className="dashboard-card" style={{ marginTop: 16 }}>
          <div className="dashboard-track-info">
            <span className="track-name">Track {viewedTrack.trackId}</span>
            <span className="track-meta">{viewedTrack.date}</span>
          </div>

          {viewedTrack.exists && viewedTrack.trackCode ? (
            <>
              <div className="dashboard-canvas-wrapper">
                <canvas ref={canvasRef} className="dashboard-canvas" width={400} height={350} />
              </div>
              <div className="play-section">
                <a
                  href={`/?track=${viewedTrack.trackId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="play-btn"
                >
                  PLAY
                </a>
              </div>
              <DirectionChanger
                trackId={viewedTrack.trackId}
                trackCode={viewedTrack.trackCode}
                mainCanvasRef={canvasRef}
                onChanged={() => setTimeout(() => handleView(), 500)}
              />
            </>
          ) : (
            <div className="no-track-msg">No track assigned for this day</div>
          )}

          <TrackBrowser
            key={browserKey}
            targetTrackId={viewedTrack.trackId}
            onSelect={() => {
              setBrowserKey((k) => k + 1);
              setTimeout(() => handleView(), 500);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---- Main Dashboard ----
export default function DashboardPage() {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<"review" | "view">("review");

  // Check if already authed by trying an API call
  useEffect(() => {
    fetch("/api/dashboard?action=random")
      .then((res) => {
        if (res.status !== 401) setAuthed(true);
      })
      .catch(() => {});
  }, []);

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />;
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="pixel-title-text">TRACK DASHBOARD</h1>
        <p className="dashboard-subtitle">Manage tracks for Hotlap Daily</p>
      </div>

      <div className="dashboard-tabs">
        <button
          className={`tab-btn ${tab === "review" ? "active" : ""}`}
          onClick={() => setTab("review")}
        >
          Review Tracks
        </button>
        <button
          className={`tab-btn ${tab === "view" ? "active" : ""}`}
          onClick={() => setTab("view")}
        >
          View / Change
        </button>
      </div>

      {tab === "review" && <ReviewTab />}
      {tab === "view" && <ViewTab />}
    </div>
  );
}
