import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import { Instagram, Youtube } from "lucide-react";

function XIcon() {
  return (
    <svg
      id="icon"
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 32 32"
    >
      <path d="m18.2342,14.1624l8.7424-10.1624h-2.0717l-7.591,8.8238-6.0629-8.8238h-6.9929l9.1684,13.3432-9.1684,10.6568h2.0718l8.0163-9.3183,6.4029,9.3183h6.9929l-9.5083-13.8376h.0005Zm-2.8376,3.2984l-.9289-1.3287L7.0763,5.5596h3.1822l5.9649,8.5323.9289,1.3287,7.7536,11.0907h-3.1822l-6.3272-9.05v-.0005Z" />
      <rect
        id="_Transparent_Rectangle_"
        data-name="<Transparent Rectangle>"
        className="cls-1"
        width="32"
        height="32"
        fill="none"
      />
    </svg>
  );
}

export const metadata: Metadata = {
  title: "Hotlap Daily",
  description: "Set your fastest laptime on iconic new tracks daily!",
  openGraph: {
    title: "Hotlap Daily",
    description:
      "Set your fastest laptime on iconic new tracks daily!",
    images: [
      {
        url: "/F1-car-8bit.png",
        type: "image/png",
      },
    ],
    url: "https://hotlapdaily.com",
    type: "website",
  },
  icons: {
    icon: "/F1-car-8bit.png",
    shortcut: "/F1-car-8bit.png",
    apple: "/F1-car-8bit.png",
  },
};

import { headers } from "next/headers";


export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";



  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/F1-car-8bit.png" type="image/png" />
        <link rel="apple-touch-icon" href="/F1-car-8bit.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Tiny5&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Kanit:wght@900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Theme initialization */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            (function() {
              const theme = localStorage.getItem('theme') || 'light';
              document.documentElement.setAttribute('data-theme', theme);
            })();
          `}
        </Script>
        {/* Microsoft Clarity Analytics Tag */}
        <Script id="ms-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "rl553ashmd");
          `}
        </Script>
        <Script src="https://html2canvas.hertzen.com/dist/html2canvas.min.js" strategy="beforeInteractive" />
      </head>
      <body>

        <Sidebar />
        {children}
        <div id="secretModal" className="share-modal" style={{ display: "none" }}>
          <div className="share-card">
            <button className="modal-close pixel-button" id="closeSecret">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="white" /></svg>
            </button>
            <div className="share-card-content" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ background: "#fff", border: "2px solid #111", borderRadius: 10, boxShadow: "0 2px 12px #0002", padding: "12px 12px 8px 12px", display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18 }}>
                <img src="/assets/secret.png" alt="Secret" style={{ width: "100%", maxWidth: 350, height: "auto", display: "block" }} />
              </div>
              <div style={{ background: "#fff", borderRadius: "0 0 10px 10px", boxShadow: "0 2px 12px #0001", padding: "18px 18px 12px 18px", maxWidth: 320, textAlign: "center" }}>
                <p style={{ fontSize: "1em", color: "#222", fontFamily: "'IBM Plex Mono', monospace", margin: 0, textAlign: "left" }}>
                  The bars represent speed for all your successful lap attempts. Lower the laptime, higher the speed!<br />
                  These are calculated relative to each other based on player&apos;s performance with highest speed in purple.<br />
                </p>
              </div>
            </div>
          </div>
        </div>
        <div id="socialModal" className="share-modal" style={{ display: "none" }}>
          <div className="share-card">
            <button className="modal-close pixel-button" id="closeSocial">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="white" /></svg>
            </button>
            <div className="share-card-content social-icons-container" style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 }}>
              <a href="https://www.instagram.com/hotlapdaily" target="_blank" rel="noopener noreferrer" className="social-icon-link" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "2px solid #111", borderRadius: "50%", width: 60, height: 60, textDecoration: "none", color: "#111", transition: "transform 0.2s ease" }}>
                <Instagram size={32} />
              </a>
              <a href="https://x.com/hotlapdaily" target="_blank" rel="noopener noreferrer" className="social-icon-link" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "2px solid #111", borderRadius: "50%", width: 60, height: 60, textDecoration: "none", color: "#111", transition: "transform 0.2s ease" }}>
                <XIcon />
              </a>
              <a href="https://youtube.com/@hotlapdaily" target="_blank" rel="noopener noreferrer" className="social-icon-link" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "2px solid #111", borderRadius: "50%", width: 60, height: 60, textDecoration: "none", color: "#111", transition: "transform 0.2s ease" }}>
                <Youtube size={32} />
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
