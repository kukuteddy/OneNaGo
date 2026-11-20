"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { photoUrl, supabase } from "@/lib/supabase";

interface Work {
  photo_path: string;
  price_twd: number | null;
  created_at: string;
  short_id: string;
  name: string;
  road: string | null;
  nickname: string | null;
}

const PAGE = 60;

export function WorksWall({ citySlug, shopIds }: { citySlug: string; shopIds: string[] }) {
  const [works, setWorks] = useState<Work[] | null>(null);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    const allowed = new Set(shopIds);
    supabase()
      .from("photo_wall")
      .select("photo_path,price_twd,created_at,short_id,name,road,nickname")
      .eq("city_slug", citySlug)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (alive) setWorks(((data ?? []) as Work[]).filter((w) => allowed.has(w.short_id)));
      });
    return () => {
      alive = false;
    };
  }, [citySlug, shopIds]);

  if (works === null) return <p className="gutter py-10 text-center text-ink-2">作品載入中…</p>;
  if (!works.length)
    return (
      <div className="gutter py-10 text-center text-ink-2">
        <p className="m-0">還沒有客人分享作品。</p>
        <p className="m-0 mt-1 text-sm">
          到任何一家店的頁面按「補充資訊 → 上傳作品照片」，審核通過就會出現在這裡，並標示你的署名。
        </p>
      </div>
    );

  return (
    <>
      <div className="gutter columns-2 gap-2 sm:columns-3">
        {works.slice(0, limit).map((w) => (
          <Link
            key={w.photo_path}
            href={`/shop/${w.short_id}/`}
            className="mb-2 block break-inside-avoid overflow-hidden rounded-xl bg-surface"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 使用者照片在 Supabase Storage */}
            <img src={photoUrl(w.photo_path)} alt={`${w.name} 的作品`} loading="lazy" className="block w-full" />
            <div className="grid gap-0.5 p-2.5">
              <b className="truncate text-sm">{w.name}</b>
              <span className="flex justify-between gap-2 text-xs text-ink-2">
                <span className="truncate">{w.nickname ? `📷 ${w.nickname}` : w.road}</span>
                {w.price_twd && <span className="shrink-0 text-brand">NT${w.price_twd.toLocaleString()}</span>}
              </span>
            </div>
          </Link>
        ))}
      </div>
      {works.length > limit && (
        <button type="button" onClick={() => setLimit(limit + PAGE)} className="mx-auto mt-2 block cursor-pointer text-brand">
          看更多作品
        </button>
      )}
    </>
  );
}
