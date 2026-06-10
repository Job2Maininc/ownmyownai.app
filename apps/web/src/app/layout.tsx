import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OwnMyOwnAI",
  description: "Votre IA sur votre PC — simple, privée, sous votre contrôle.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://ownmyownai.app"),
  openGraph: {
    title: "OwnMyOwnAI",
    description: "Votre IA vit chez vous. Simple · Privé · Local",
    siteName: "OwnMyOwnAI",
  },
};

export const viewport: Viewport = {
  themeColor: "#F7FAF8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${plusJakarta.variable} ${ibmPlexMono.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
