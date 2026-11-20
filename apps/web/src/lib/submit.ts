"use client";

import { SITE } from "./site";
import { supabase } from "./supabase";

/**
 * 使用者投稿（回報、照片、評論、認領）的唯一入口。
 *
 * - 沒設定 Turnstile：直接寫入 Supabase（RLS 只允許新增 pending 資料）。
 * - 有設定 Turnstile：送到 Edge Function `submit`，先驗證人機再寫入；照片用一次性上傳網址。
 */

export type SubmitTable = "reports" | "reviews" | "claims";

export const TURNSTILE_ENABLED = !!SITE.turnstile.siteKey;

export function clientId(): string | null {
  try {
    let id = localStorage.getItem("onenago_cid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("onenago_cid", id);
    }
    return id;
  } catch {
    return null;
  }
}

/** 圖片欄位：回報的作品照片、認領的店家 Logo。 */
export const PHOTO_COLUMN: Partial<Record<SubmitTable, string>> = { reports: "photo_path", claims: "logo_path" };

/** 縮到最長邊 maxSide 的 JPEG；重新繪製也會去掉 EXIF（含拍攝地點）。 */
export async function shrinkPhoto(file: File, maxSide = 1600): Promise<Blob> {
  const img = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * s);
  canvas.height = Math.round(img.height * s);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error("照片處理失敗"))), "image/jpeg", 0.85),
  );
}

export class SubmitError extends Error {}

export async function submit(
  table: SubmitTable,
  row: Record<string, unknown>,
  opts: { photo?: Blob; turnstileToken?: string } = {},
): Promise<void> {
  const payload: Record<string, unknown> = { ...row, client_id: clientId() };

  if (TURNSTILE_ENABLED) {
    if (!opts.turnstileToken) throw new SubmitError("請先完成驗證");
    const res = await fetch(`${SITE.supabase.url}/functions/v1/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SITE.supabase.publishableKey },
      body: JSON.stringify({ table, row: payload, token: opts.turnstileToken, photo: !!opts.photo }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; upload?: { path: string; token: string } };
    if (!res.ok) throw new SubmitError(body.error ?? "送出失敗");
    if (opts.photo && body.upload) {
      const { error } = await supabase()
        .storage.from("ugc-photos")
        .uploadToSignedUrl(body.upload.path, body.upload.token, opts.photo, { contentType: "image/jpeg" });
      if (error) throw new SubmitError("照片上傳失敗");
    }
    return;
  }

  const photoColumn = PHOTO_COLUMN[table];
  if (opts.photo && photoColumn) {
    const name = `${crypto.randomUUID()}.jpg`;
    const { error } = await supabase()
      .storage.from("ugc-photos")
      .upload(`u/${name}`, opts.photo, { contentType: "image/jpeg" });
    if (error) throw new SubmitError("照片上傳失敗");
    payload[photoColumn] = name;
  }
  const { error } = await supabase().from(table).insert(payload);
  if (error) throw new SubmitError("送出失敗");
}
