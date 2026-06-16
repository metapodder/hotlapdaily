"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Sidebar() {
  const [showSecretButton, setShowSecretButton] = useState(false);
  const [showSocialButton, setShowSocialButton] = useState(false);

  useEffect(() => {
    try {
      const secretModal = document.getElementById("secretModal");
      setShowSecretButton(!!secretModal);
      const socialModal = document.getElementById("socialModal");
      setShowSocialButton(!!socialModal);
    } catch {}

    const hamburger = document.getElementById("hamburger");
    const sidePanel = document.getElementById("sidePanel");

    if (!hamburger || !sidePanel) return;

    // Ensure initial closed state
    try {
      if (!sidePanel.style.left) sidePanel.style.left = "-260px";
    } catch {}

    // If another script (e.g., game.js) already wired the onclick, do not attach our own
    if (!(hamburger as HTMLDivElement).onclick) {
      (hamburger as HTMLDivElement).onclick = (e: MouseEvent) => {
        e.stopPropagation();
        const isOpen = sidePanel.style.left === "0px" || sidePanel.style.left === "0";
        if (isOpen) {
          sidePanel.style.left = "-260px";
          hamburger.classList.remove("active", "panel-open");
        } else {
          sidePanel.style.left = "0";
          hamburger.classList.add("active", "panel-open");
        }
      };

      const onDocClick = (e: MouseEvent) => {
        if (!sidePanel || !hamburger) return;
        const isOpen = sidePanel.style.left === "0px" || sidePanel.style.left === "0";
        if (!isOpen) return;
        const target = e.target as Node;
        if (!sidePanel.contains(target) && !hamburger.contains(target)) {
          sidePanel.style.left = "-260px";
          hamburger.classList.remove("active", "panel-open");
        }
      };
      document.addEventListener("click", onDocClick);

      const onEsc = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        if (sidePanel.style.left === "0px" || sidePanel.style.left === "0") {
          sidePanel.style.left = "-260px";
          hamburger.classList.remove("active", "panel-open");
        }
      };
      document.addEventListener("keydown", onEsc);

      // Wire modal close behaviors for Secret and Social on all pages
      const secretModal = document.getElementById("secretModal");
      const closeSecret = document.getElementById("closeSecret");
      const socialModal = document.getElementById("socialModal");
      const closeSocial = document.getElementById("closeSocial");

      const closeSecretModal = () => {
        if (!secretModal) return;
        secretModal.classList.remove("visible");
        setTimeout(() => { (secretModal as HTMLElement).style.display = "none"; }, 150);
      };
      const closeSocialModal = () => {
        if (!socialModal) return;
        socialModal.classList.remove("visible");
        setTimeout(() => { (socialModal as HTMLElement).style.display = "none"; }, 150);
      };
      const onSecretOutside = (e: MouseEvent) => { if (e.target === secretModal) closeSecretModal(); };
      const onSocialOutside = (e: MouseEvent) => { if (e.target === socialModal) closeSocialModal(); };
      const onKeyEsc = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        if (secretModal && secretModal.classList.contains("visible")) closeSecretModal();
        if (socialModal && socialModal.classList.contains("visible")) closeSocialModal();
      };

      if (closeSecret) closeSecret.addEventListener("click", closeSecretModal);
      if (secretModal) secretModal.addEventListener("click", onSecretOutside);
      if (closeSocial) closeSocial.addEventListener("click", closeSocialModal);
      if (socialModal) socialModal.addEventListener("click", onSocialOutside);
      document.addEventListener("keydown", onKeyEsc);

      return () => {
        try { (hamburger as HTMLDivElement).onclick = null; } catch {}
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onEsc);
        try {
          if (closeSecret) closeSecret.removeEventListener("click", closeSecretModal);
          if (secretModal) secretModal.removeEventListener("click", onSecretOutside);
          if (closeSocial) closeSocial.removeEventListener("click", closeSocialModal);
          if (socialModal) socialModal.removeEventListener("click", onSocialOutside);
          document.removeEventListener("keydown", onKeyEsc);
        } catch {}
      };
    }
  }, []);

  const closePanel = () => {
    try {
      const hamburger = document.getElementById("hamburger");
      const sidePanel = document.getElementById("sidePanel");
      if (!hamburger || !sidePanel) return;
      sidePanel.style.left = "-260px";
      hamburger.classList.remove("active", "panel-open");
    } catch {}
  };

  const openSecret = () => {
    try {
      const secretModal = document.getElementById("secretModal");
      const closeSecret = document.getElementById("closeSecret");
      if (!secretModal || !closeSecret) return;
      // mimic game.js open behavior
      (secretModal as HTMLElement).style.display = "flex";
      void (secretModal as HTMLElement).offsetHeight;
      secretModal.classList.add("visible");
      closePanel();
    } catch {}
  };

  const openSocial = () => {
    try {
      const socialModal = document.getElementById("socialModal");
      const closeSocial = document.getElementById("closeSocial");
      if (!socialModal || !closeSocial) return;
      (socialModal as HTMLElement).style.display = "flex";
      void (socialModal as HTMLElement).offsetHeight;
      socialModal.classList.add("visible");
      closePanel();
    } catch {}
  };


  return (
    <>
      <div id="hamburger" aria-label="Open menu" role="button" tabIndex={0}>
        <div className="hamburger-bar"></div>
        <div className="hamburger-bar"></div>
        <div className="hamburger-bar"></div>
      </div>
      <div
        id="sidePanel"
        style={{position:"fixed",top:0,left:-260,width:240,height:"100vh",background:"#fff",boxShadow:"2px 0 12px #0002",zIndex:300,transition:"left 0.6s"}}
      >
        <div style={{padding:"60px 24px 24px 24px", display:"flex", flexDirection:"column", gap:18}}>
          <Link href="/" onClick={(e) => { e.preventDefault(); closePanel(); window.location.href = "/"; }} style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none",color:"#222",fontFamily:"'IBM Plex Mono',monospace"}}>Home</Link>
          <Link href="/track-generator" onClick={closePanel} style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none",color:"#222",fontFamily:"'IBM Plex Mono',monospace"}}>Track Generator</Link>
          <Link href="/global-leaderboard" onClick={closePanel} style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none",color:"#222",fontFamily:"'IBM Plex Mono',monospace"}}>Global Leaderboard</Link>
          {showSecretButton && (
            <button id="secretBtn" onClick={openSecret} style={{background:"none",border:"none",display:"flex",alignItems:"center",gap:10,fontSize:"1em",color:"#222",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace"}}>
              <span>Secret</span>
            </button>
          )}
          {showSocialButton ? (
            <button onClick={openSocial} style={{background:"none",border:"none",display:"flex",alignItems:"center",gap:10,fontSize:"1em",color:"#222",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace"}}>Social</button>
          ) : (
            <a href="https://x.com/hotlapdaily" target="_blank" rel="noopener noreferrer" onClick={closePanel} style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none",color:"#222",fontFamily:"'IBM Plex Mono',monospace"}}>Social</a>
          )}
          <a href="https://hotlapdaily.featurebase.app" target="_blank" rel="noopener noreferrer" onClick={closePanel} style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none",color:"#222",fontFamily:"'IBM Plex Mono',monospace"}}>Feedback</a>
          <Link href="/privacy" onClick={closePanel} style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none",color:"#222",fontFamily:"'IBM Plex Mono',monospace"}}>Privacy Policy</Link>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",textDecoration:"none",color:"#222",fontFamily:"'IBM Plex Mono',monospace"}}>
            <span>Dark Mode</span>
            <div
              className="theme-toggle-switch"
              onClick={() => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
              }}
            >
              <div className="theme-toggle-slider"></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


