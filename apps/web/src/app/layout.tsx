import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OwnMyOwnAI",
  description: "Votre IA sur votre PC — simple, privé, écologique.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
