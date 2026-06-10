import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#131712",
          borderRadius: 8,
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="10" stroke="#4EC9A0" strokeWidth="1.5" opacity="0.5" />
          <circle cx="16" cy="16" r="3.5" fill="#4EC9A0" />
          <path
            d="M16 6 A10 10 0 0 1 24 14"
            stroke="#4EC9A0"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
