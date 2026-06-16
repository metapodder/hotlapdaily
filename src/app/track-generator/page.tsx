"use client";
import "./track-generator.css";
import { useEffect } from "react";
import { initTrackGenerator } from "@/lib/trackGenerator";

export default function TrackGeneratorPage() {
  // Sidebar handled globally
  useEffect(() => {
    try {
      initTrackGenerator();
    } catch {}
  }, []);
  return (
    <>
      <div className="track-generator-container">
        {/* <Link href="/" className="back-button" aria-label="Back">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#111">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </Link> */}
        <div className="generator-header" style={{margin: "0 25px"}}>
          <h1 className="fade-in pixel-title-text" style={{margin: 0}}>TRACK GENERATOR</h1>
          <p className="generator-subtitle">Build your own custom tracks and we will feature in upcoming days</p>
        </div>

        <div className="instructions redesigned-instructions">
          <h4>How to use:</h4>
          <ul className="instructions-list">
            <li><strong>Draw:</strong>
              <ul>
                <li>Draw your track directly on the canvas with mouse or finger without lifting</li>
                <li>Your flow will respect car&apos;s direction on launch. Example: Drawing the track clockwise will set the direction</li>
              </ul>
            </li>
            <li><strong>Preview:</strong> Your track renders automatically as you draw</li>
            <li><strong>Submit:</strong> Once your track is free of errors, hit submit to be featured in future</li>
          </ul>
        </div>

        <div className="generator-layout">
          <div className="control-panel">
            <div className="control-section">
              <h3>Actions</h3>
              <div className="control-buttons">
                <button className="btn btn-warning" id="undoBtn">Undo Last</button>
                <button className="btn btn-secondary" id="clearBtn">Clear All</button>
                <button className="btn btn-primary" id="loadExampleBtn">Load Example</button>
              </div>
            </div>
            <div className="control-section" style={{marginTop: "20px"}}>
              <h3>Starting Angle</h3>
              <div className="input-group" style={{flexDirection: "column", gap: "8px"}}>
                <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                  <label htmlFor="startAngleInput" style={{fontSize: "0.85rem", color: "var(--text-secondary)", minWidth: "60px"}}>Angle:</label>
                  <input
                    type="range"
                    id="startAngleInput"
                    min="0"
                    max="360"
                    step="1"
                    defaultValue="0"
                    style={{flex: "1", cursor: "pointer"}}
                  />
                  <span id="startAngleDisplay" style={{fontSize: "0.85rem", fontFamily: "'IBM Plex Mono', monospace", minWidth: "45px", textAlign: "right"}}>0°</span>
                </div>
                <div style={{fontSize: "0.75rem", color: "#666", fontStyle: "italic"}}>0° = Right, 90° = Down, 180° = Left, 270° = Up</div>
              </div>
            </div>
            <div className="control-section" style={{marginTop: "20px"}}>
              <h3>Checkpoint Markers</h3>
              <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                <input
                  type="checkbox"
                  id="checkpointToggle"
                  className="checkpoint-toggle"
                  defaultChecked
                />
                <label htmlFor="checkpointToggle" style={{fontSize: "0.85rem", color: "var(--text-secondary)", cursor: "pointer", userSelect: "none"}}>Show checkpoint zones on track</label>
              </div>
            </div>
          </div>

          <div className="canvas-container">
            <canvas id="trackCanvas" className="track-canvas" width={600} height={450}></canvas>
          </div>

          <div id="trackErrorDisplay" style={{display:'none', gridColumn:'1 / -1'}}></div>
          <div className="code-output">
            <div id="statusMsg" style={{marginBottom:8, marginTop:4, fontWeight:500, textAlign:'center', width:'100%', maxWidth:'100vw', wordBreak:'break-word', boxSizing:'border-box'}}></div>
            <button className="btn" id="submitBtn">Submit Track</button>
            <button className="btn btn-primary" id="testTrackBtn" style={{marginTop:10, display:'none'}}>Test Track</button>
            <div style={{height:80}}></div>
            <h3 style={{display:'none'}}>Generated Track Function</h3>
            <textarea id="codeOutput" style={{display:'none'}} placeholder="Generated JavaScript code will appear here..."></textarea>
            <button className="btn btn-primary" id="copyCodeBtn" style={{display:'none', marginTop:10}}>Copy to Clipboard</button>
            <div className="track-points-section" style={{display:'none', marginTop:20}}>
              <h3>Track Points</h3>
              <div className="point-list" id="pointList">
                <div style={{textAlign:'center', color:'#999', fontStyle:'italic'}}>No points added yet</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="submitModal" className="modal">
        <div className="modal-blur"></div>
        <div className="modal-content">
          <button className="close-btn" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4L14 14M14 4L4 14" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </button>
          <h2 className="pixel-title-text" style={{fontSize:32, color:'var(--text-primary)'}}>Submit Track</h2>
          <br />
          <input type="text" id="nameInput" placeholder="Your Name or Nickname" />
          <div style={{height:18}}></div>
          <button id="modalSubmitBtn" className="btn btn-primary">Submit to Hotlap Daily</button>
          <br /><br />
          <div id="modalStatusMsg" className="status-loading" style={{minHeight:22}}></div>
        </div>
      </div>

      {/* Sidebar is globally rendered */}

      {/* track generator now initializes via module in useEffect */}
    </>
  );
}


