import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "香港實時交通資訊 | Hong Kong Real-Time Traffic Monitor",
  description: "一站查看全港衝紅燈攝影機、偵速攝影機機箱及運輸署交通快拍。官方開放數據，毋須登入。",
  manifest: "/site.webmanifest",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon-32x32.png",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-HK">
      <body className="antialiased">{children}</body>
    </html>
  );
}
