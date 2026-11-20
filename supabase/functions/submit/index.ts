// 玩哪走 OneNaGo：投稿入口（Cloudflare Turnstile 人機驗證 → 寫入）
//
// 啟用方式見 docs/ADMIN.md「啟用防灌水」。啟用後執行 supabase/optional/enable_turnstile.sql，
// 關閉匿名直接寫入，所有投稿都必須經過這裡。
//
// 需要的 secrets：TURNSTILE_SECRET_KEY、ALLOWED_ORIGINS（逗號分隔）
// Supabase 自動提供：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const COLUMNS: Record<string, string[]> = {
  reports: ["merchant_id", "merchant_name", "kind", "value", "price_twd", "client_id"],
  reviews: ["merchant_id", "rating", "body", "nickname", "visited_on", "client_id"],
  claims: ["merchant_id", "merchant_name", "owner_name", "role", "contact", "proof", "client_id"],
};

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function cors(origin: string | null): Record<string, string> {
  const ok = origin && allowedOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowedOrigins[0] ?? "",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const form = new FormData();
  form.append("secret", Deno.env.get("TURNSTILE_SECRET_KEY") ?? "");
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, headers);

  let payload: { table?: string; row?: Record<string, unknown>; token?: string; photo?: boolean };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "格式錯誤" }, 400, headers);
  }
  const { table, row, token, photo } = payload;
  const columns = table ? COLUMNS[table] : undefined;
  if (!columns || !row || typeof token !== "string") return json({ error: "格式錯誤" }, 400, headers);

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!(await verifyTurnstile(token, ip))) return json({ error: "驗證失敗，請重新整理後再試" }, 403, headers);

  // 只取白名單欄位；狀態一律是 pending（資料庫的 check 會再擋一次長度與格式）
  const clean: Record<string, unknown> = Object.fromEntries(columns.filter((c) => c in row).map((c) => [c, row[c]]));
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  let upload: { path: string; token: string } | undefined;
  if (table === "reports" && photo) {
    const name = `${crypto.randomUUID()}.jpg`;
    const { data, error } = await sb.storage.from("ugc-photos").createSignedUploadUrl(`u/${name}`);
    if (error || !data) return json({ error: "照片上傳準備失敗" }, 500, headers);
    clean.photo_path = name;
    upload = { path: data.path, token: data.token };
  }

  const { error } = await sb.from(table!).insert({ ...clean, status: "pending" });
  if (error) return json({ error: "資料格式不正確" }, 400, headers);
  return json({ ok: true, upload }, 200, headers);
});
