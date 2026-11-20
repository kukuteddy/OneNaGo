import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SITE } from "./site";

let client: SupabaseClient | null = null;

/** 共用的 Supabase 用戶端（只用 publishable key：只能讀公開資料、新增回報）。 */
export function supabase(): SupabaseClient {
  client ??= createClient(SITE.supabase.url, SITE.supabase.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

let admin: SupabaseClient | null = null;

/** 管理頁專用：會保存登入狀態（只在瀏覽器使用）。權限由 admins 資料表與 RLS 決定。 */
export function adminClient(): SupabaseClient {
  admin ??= createClient(SITE.supabase.url, SITE.supabase.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "onenago-admin" },
  });
  return admin;
}

export function photoUrl(path: string): string {
  return `${SITE.supabase.url}/storage/v1/object/public/ugc-photos/u/${encodeURIComponent(path)}`;
}
