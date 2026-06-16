import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        textAlign: "center",
        fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      <Image
        src="/broken-car.png"
        alt="Broken Car"
        width={200}
        height={200}
        style={{ marginBottom: "2rem" }}
      />
      <h1
        className="pixel-title-text"
        style={{
          fontSize: "3rem",
          marginBottom: "1rem",
          color: "var(--text-primary)",
        }}
      >
        404
      </h1>
      <p
        style={{
          fontSize: "1.2rem",
          marginBottom: "2rem",
          color: "var(--text-secondary)",
        }}
      >
        Page not found
      </p>
      <Link
        href="/"
        className="pixel-button"
        style={{
          textDecoration: "none",
          display: "inline-block",
        }}
      >
        GO HOME
      </Link>
    </div>
  );
}

