import { ImageResponse } from "next/og";

export const alt = "OwnMyOwnAI — Votre IA vit chez vous.";
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
          background: "linear-gradient(135deg, #131712 0%, #1A3D32 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 40 }}>
          <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="10" stroke="#4EC9A0" strokeWidth="1.5" opacity="0.5" />
            <circle cx="16" cy="16" r="3.5" fill="#4EC9A0" />
            <path
              d="M16 6 A10 10 0 0 1 24 14"
              stroke="#4EC9A0"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span style={{ fontSize: 48, fontWeight: 700, color: "#F2F5F0" }}>
            OwnMyOwn<span style={{ color: "#4EC9A0" }}>AI</span>
          </span>
        </div>
        <p style={{ fontSize: 56, fontWeight: 700, color: "#F2F5F0", lineHeight: 1.2, margin: 0 }}>
          Votre IA vit chez vous.
        </p>
        <p style={{ fontSize: 28, color: "#9BA89E", marginTop: 24 }}>
          Simple · Privé · Local
        </p>
      </div>
    ),
    { ...size },
  );
}
