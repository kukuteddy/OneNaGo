"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Community } from "./types";

/** IG / LINE / 歇業 / 搬家要幾個不同的人回報一致才顯示。 */
export const MIN_REPORTERS = 2;

interface SummaryRow {
  merchant_id: string;
  kind: "ig" | "line" | "price" | "closed" | "moved";
  value: string | null;
  reporters: number;
  price_median: number | null;
}

interface PhotoRow {
  merchant_id: string;
  photo_path: string;
  price_twd: number | null;
}

interface StatRow {
  merchant_id: string;
  reviews: number;
  rating: number;
}

export type CommunityMap = Map<string, Community>;

export function buildCommunity(summary: SummaryRow[], photos: PhotoRow[], stats: StatRow[] = []): CommunityMap {
  const map: CommunityMap = new Map();
  const get = (id: string) => {
    let c = map.get(id);
    if (!c) map.set(id, (c = { photos: [] }));
    return c;
  };
  for (const s of summary) {
    const c = get(s.merchant_id);
    if (s.kind === "ig" && s.value && s.reporters >= MIN_REPORTERS) c.ig ??= s.value;
    if (s.kind === "line" && s.value && s.reporters >= MIN_REPORTERS) c.line ??= s.value;
    if (s.kind === "price" && s.price_median) c.price = Math.round(s.price_median / 10) * 10;
    if ((s.kind === "closed" || s.kind === "moved") && s.reporters >= MIN_REPORTERS) {
      c.warning ??= s.kind === "closed" ? "多人回報已歇業" : "多人回報已搬家";
    }
  }
  for (const p of photos) get(p.merchant_id).photos.push({ path: p.photo_path, price: p.price_twd });
  for (const r of stats) get(r.merchant_id).rating = { avg: r.rating, count: r.reviews };
  return map;
}

/** 讀取使用者補充（彙整結果與審核通過的照片）。讀不到時回傳空的，網站照常顯示。 */
export function useCommunity(merchantIds?: string[]): CommunityMap {
  const [map, setMap] = useState<CommunityMap>(new Map());
  const key = merchantIds?.join(",") ?? "*";
  useEffect(() => {
    let alive = true;
    const ids = key === "*" ? null : key.split(",");
    const summary = supabase().from("report_summary").select("merchant_id,kind,value,reporters,price_median");
    const photos = supabase()
      .from("approved_photos")
      .select("merchant_id,photo_path,price_twd")
      .order("created_at", { ascending: false });
    const stats = supabase().from("review_stats").select("merchant_id,reviews,rating");
    Promise.all([
      ids ? summary.in("merchant_id", ids) : summary,
      ids ? photos.in("merchant_id", ids) : photos,
      ids ? stats.in("merchant_id", ids) : stats,
    ])
      .then(([s, p, r]) => {
        if (alive)
          setMap(
            buildCommunity((s.data ?? []) as SummaryRow[], (p.data ?? []) as PhotoRow[], (r.data ?? []) as StatRow[]),
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  return map;
}
