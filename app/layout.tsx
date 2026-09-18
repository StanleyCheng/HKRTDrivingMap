import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "香港即時駕駛地圖 | Hong Kong RT Driving Map",
  description: "一站式查看全港衝紅燈攝影機、偵速攝影機、運輸署交通快拍、實時路段車速、特別交通消息、停車場空位及天文台雨量。官方開放數據，毋須登入。 | One-stop view of red-light cameras, speed cameras, traffic snapshots, live road-segment speeds, incidents, parking vacancy and HKO rainfall. Official open data.",
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
