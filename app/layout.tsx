import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "香港實時交通資訊 | Hong Kong Real-Time Traffic Monitor",
  description: "一站查看全港衝紅燈攝影機、偵速攝影機機箱及運輸署交通快拍。官方開放數據，毋須登入。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
