"use client";
import Link from "next/link";
// export const metadata = {
//   title: "Privacy Policy | hotlapdaily",
// };

export default function PrivacyPage() {
  return (
    <div style={{height:"100vh", width:"100%", overflowY:"auto", WebkitOverflowScrolling:"touch"}}>
      <style jsx global>{`
        :root {
          --text: #222;
          --bg: #fafbfc;
          --link: #2b6cb0;
          --card: #fff;
          --shadow: #0001;
          --muted: #888;
          --notice-bg: #f6f8fa;
          --notice-accent: #b4b4ff;
        }
        [data-theme="dark"] {
          --text: #e0e0e0;
          --bg: #1a1a1a;
          --link: #66b3ff;
          --card: #252525;
          --shadow: #fff1;
          --muted: #999;
          --notice-bg: #2a2a2a;
          --notice-accent: #7676ff;
        }
        html { font-size: 16px; }
        body {
          font-family: 'IBM Plex Mono', monospace;
          background: var(--bg);
          color: var(--text);
          margin: 0;
          padding: 0 0 40px 0;
          line-height: 1.6;
        }
        .privacy-container {
          max-width: 650px;
          margin: 40px auto 0 auto;
          background: var(--card);
          border-radius: 10px;
          box-shadow: 0 2px 16px var(--shadow);
          padding: 32px 24px 24px 24px;
        }
        h1, h2, h3, h4 { line-height: 1.25; }
        h1 { font-size: 1.875rem; margin: 0 0 0.5em 0; }
        h2 { font-size: 1.5rem; margin: 1.25em 0 0.5em 0; }
        h3 { font-size: 1.25rem; margin: 1.25em 0 0.5em 0; }
        h4 { font-size: 1.1rem; margin: 1.25em 0 0.5em 0; }

        p { margin: 0 0 1em 0; }

        ul { margin: 0 0 1em 1.25em; padding: 0; }
        ul ul { margin-top: 0.5em; }
        li { margin: 0.25em 0; }

        code {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 0.95em;
          background: #f2f4f7;
          padding: 0 4px;
          border-radius: 4px;
        }

        .last-updated {
          color: var(--muted);
          font-size: 0.98rem;
          margin-bottom: 1.25em;
          display: block;
        }

        .notice {
          background: var(--notice-bg);
          border-left: 4px solid var(--notice-accent);
          padding: 12px 16px;
          margin-bottom: 1.5em;
          font-size: 1rem;
        }

        a { color: var(--link); }

        @media (max-width: 700px) {
          .privacy-container {
            margin: 0;
            border-radius: 0;
            box-shadow: none;
            padding: 18px 8px 18px 8px;
          }
        }
      `}</style>
      {/* Content */}
      <div className="privacy-container">
      <h1>Privacy Policy</h1>
      <Link
        href="/"
        className="pixel-button"
        style={{ display: "inline-block", margin: "8px 0 16px 0" }}
        onClick={e => {
          e.preventDefault();
          if (typeof window !== "undefined") window.location.href = "/";
        }}
      >
        BACK
      </Link>
      <span className="last-updated">Last updated: 08-07-2025</span>

      <div className="notice">
        <b>Microsoft Clarity Notice:</b> This website uses Microsoft Clarity to analyze user interactions. By using this site, you agree to the collection and processing of data by Microsoft Clarity as described in this policy, the
        <a href="https://privacy.microsoft.com/en-us/privacystatement" target="_blank" rel="noopener"> Microsoft Privacy Statement</a> and the
        <a href="https://clarity.microsoft.com/terms" target="_blank" rel="noopener"> Microsoft Clarity Terms of Service</a>.
      </div>

      <p>Welcome to <b>hotlapdaily</b>. This Privacy Policy explains what we collect and how we use it.</p>

      <h3>1) What we collect</h3>
      <p>When you play, the app may collect and/or generate the following:</p>
      <ul>
        <li><b>Driver name</b> you enter (optional; you may use a pseudonym).</li>
        <li><b>Gameplay metrics</b>: lap times (including best lap) and track name.</li>
        <li><b>Timestamps</b> when a best lap is submitted.</li>
        <li><b>Technical/validation telemetry</b> saved with best lap submissions:</li>
        <li><b>Locally processed anti‑cheat checks</b> (e.g., checkpoint visits/order) may run in your browser; these are used to validate runs and are not stored in our database. Anti‑cheat submission fields are currently disabled in our database schema.</li>
      </ul>

      <h3>2) Where data goes</h3>
      <ul>
        <li><b>Database:</b> When you set a best lap, the game sends: best_lap (time), driver_name, track_name, created_at, and in-game telemetry.</li>
        <li><b>Microsoft Clarity (analytics):</b> We send minimal analytics signals:
          <ul>
            <li>Properties set: <code>lastLapTime</code>, <code>totalLapsCompleted</code></li>
            <li>Event: <code>new_best_lap</code></li>
          </ul>
          Clarity may also collect interaction data (e.g., clicks, scrolls) and device/browser metadata per Microsoft’s policies.
        </li>
      </ul>

      <h3>3) Device/browser info</h3>
      <ul>
        <li>We detect general device type via your browser’s user agent to adjust features (e.g., mobile/iOS handling). This check happens locally and is not stored in our database.</li>
        <li>Microsoft Clarity may process device and browser information as part of its service.</li>
      </ul>

      <h3>4) Cookies and similar technologies</h3>
      <ul>
        <li>We do not set our own tracking cookies.</li>
        <li>Microsoft Clarity may use cookies or similar technologies according to its policies. See Microsoft’s
          <a href="https://privacy.microsoft.com/en-us/privacystatement" target="_blank" rel="noopener"> Privacy Statement</a>.
        </li>
      </ul>

      <h3>5) How we use data</h3>
      <ul>
        <li>Show and maintain game results.</li>
        <li>Detect invalid runs and tune gameplay.</li>
        <li>Improve the site via aggregate analytics.</li>
      </ul>

      <h3>6) Data sharing and selling</h3>
      <ul>
        <li>We do not sell your data.</li>
        <li>Processors: Microsoft (Clarity) and the database process data on our behalf.</li>
      </ul>

      <h3>7) Retention</h3>
      <ul>
        <li>Best-lap submissions are kept until removed during routine cleanup or upon your request.</li>
      </ul>

      <h3>8) Your choices and rights</h3>
      <ul>
        <li>Use a pseudonymous driver name if you do not want to share your real name.</li>
        <li>Request access or deletion of your best-lap entries by contacting us (include your driver name and track details).</li>
      </ul>

      <h3>9) Contact</h3>
      <p>Questions or requests: <a href="https://x.com/hotlapdaily" target="_blank" rel="noopener">@hotlapdaily on X</a>.</p>
    </div>
    </div>
  );
}


