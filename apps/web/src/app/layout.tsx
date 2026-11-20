import type { Metadata, Viewport } from "next";
import { SITE, SITE_URL, asset } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(`${SITE_URL}/`),
  title: { default: `${SITE.name} ${SITE.nameEn}｜${SITE.tagline}`, template: `%s｜${SITE.name}` },
  description: `${SITE.name} ${SITE.nameEn}：${SITE.tagline}。依行業、城市一次比較附近店家。`,
  applicationName: SITE.nameEn,
  icons: {
    icon: [{ url: asset("/icons/icon.svg"), type: "image/svg+xml" }],
    apple: asset("/icons/apple-touch-icon.png"),
  },
  manifest: asset("/manifest.webmanifest"),
  openGraph: {
    siteName: `${SITE.name} ${SITE.nameEn}`,
    locale: "zh_TW",
    type: "website",
    images: [{ url: asset("/og.jpg"), width: 1200, height: 670 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#FF6827",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
