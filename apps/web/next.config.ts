import path from "node:path";
import type { NextConfig } from "next";

// GitHub Pages 專案網址是 /OneNaGo/；本機開發與自訂網域則是 /
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// monorepo：網站會讀取 repo 根目錄的 config/（與 ETL 共用）
const repoRoot = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  output: "export", // 純靜態網站：任何免費主機都能放
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
