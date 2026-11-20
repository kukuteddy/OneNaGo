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

export function photoUrl(path: string): string {
  return `${SITE.supabase.url}/storage/v1/object/public/ugc-photos/u/${encodeURIComponent(path)}`;
}
