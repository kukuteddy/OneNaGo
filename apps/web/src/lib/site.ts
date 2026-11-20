import site from "../../../../config/site.json";

/** 網站設定（config/site.json）。這些都是公開資訊；安全性由資料庫權限（RLS）把關。 */
export const SITE = site;

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kukuteddy.github.io/OneNaGo";

/** 加上 basePath 的站內資源路徑（public/ 底下的檔案用）。 */
export function asset(path: string): string {
  return `${BASE_PATH}${path}`;
}
