import { ImageResponse } from "next/og";

export const alt = "OwnMyOwnAI — Votre IA chez vous.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(160deg, #E3F5ED 0%, #F7FAF8 50%, #FFFFFF 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 40 }}>
          <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="10" fill="#E3F5ED" />
            <circle cx="16" cy="16" r="10" stroke="#0A9B6E" strokeWidth="1.5" opacity="0.45" />
            <circle cx="16" cy="16" r="3.5" fill="#0A9B6E" />
            <path
              d="M16 6 A10 10 0 0 1 24 14"
              stroke="#0A9B6E"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span style={{ fontSize: 48, fontWeight: 700, color: "#1A2E26" }}>
            OwnMyOwn<span style={{ color: "#0A9B6E" }}>AI</span>
          </span>
        </div>
        <p style={{ fontSize: 56, fontWeight: 700, color: "#1A2E26", lineHeight: 1.2, margin: 0 }}>
          Votre IA, chez vous.
        </p>
        <p style={{ fontSize: 28, color: "#5F7068", marginTop: 24 }}>
          Simple · Privé · Clé en main
        </p>
      </div>
    ),
    { ...size },
  );
}
