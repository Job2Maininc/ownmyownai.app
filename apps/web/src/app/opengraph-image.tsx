import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "OwnMyOwnAI — Votre IA chez vous.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const [iconBuffer, heroBuffer] = await Promise.all([
    readFile(join(process.cwd(), "public", "brand", "icon.png")),
    readFile(join(process.cwd(), "public", "brand", "hero.png")),
  ]);
  const iconSrc = `data:image/png;base64,${iconBuffer.toString("base64")}`;
  const heroSrc = `data:image/png;base64,${heroBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(160deg, #E3F5ED 0%, #F7FAF8 45%, #FFFFFF 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 72,
            flex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconSrc} width={56} height={56} alt="" style={{ borderRadius: 12 }} />
            <span style={{ fontSize: 44, fontWeight: 700, color: "#1A2E26" }}>
              OwnMyOwn<span style={{ color: "#0A9B6E" }}>AI</span>
            </span>
          </div>
          <p style={{ fontSize: 52, fontWeight: 700, color: "#1A2E26", lineHeight: 1.15, margin: 0 }}>
            Votre IA, chez vous.
          </p>
          <p style={{ fontSize: 26, color: "#5F7068", marginTop: 20 }}>
            Simple · Privé · Clé en main
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", paddingRight: 48 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroSrc}
            width={480}
            height={270}
            alt=""
            style={{ borderRadius: 16, objectFit: "cover" }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
