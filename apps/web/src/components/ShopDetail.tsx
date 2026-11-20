"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useCommunity } from "@/lib/community";
import { photoUrl } from "@/lib/supabase";
import { kindLabel, withCommunity, yearsOpen } from "@/lib/shop";
import type { City, Shop, Vertical } from "@/lib/types";
import { ContributeDialog } from "./ContributeDialog";
import { KindTag, ShopActions, ShopBadges, ShopThumb } from "./ShopParts";

const ShopMap = dynamic(() => import("./ShopMap").then((m) => m.ShopMap), { ssr: false });

const SOURCE_LABEL: Record<string, string> = {
  gov_open_data: "財政部稅籍登記",
  manual: "公開網路資訊",
};

export function ShopDetail({ shop, city, vertical }: { shop: Shop; city: City; vertical: Vertical }) {
  const community = useCommunity([shop.id]);
  const c = community.get(shop.id);
  const v = withCommunity(shop, c);
  const [dialogKey, setDialogKey] = useState<number | null>(null);
  const years = yearsOpen(shop);

  const facts: [string, React.ReactNode][] = [
    ["類型", kindLabel(shop.kind)],
    ["地址", shop.address ?? "未提供"],
    ...(shop.phone ? ([["電話", <span key="p" className="select-all tabular-nums">{shop.phone}</span>]] as [string, React.ReactNode][]) : []),
    ...(shop.established
      ? ([["開業", `${shop.established.slice(0, 7).replace("-", " 年 ")} 月（約 ${Math.floor(years ?? 0)} 年）`]] as [string, React.ReactNode][])
      : []),
    ...(shop.registeredName && shop.registeredName !== shop.name
      ? ([["登記名稱", shop.registeredName]] as [string, React.ReactNode][])
      : []),
    ["資料來源", shop.sources.map((s) => SOURCE_LABEL[s] ?? s).join("、")],
  ];

  return (
    <main className="mx-auto max-w-3xl pb-10">
      <section className="gutter grid grid-cols-[96px_minmax(0,1fr)] gap-4 py-4">
        <ShopThumb shop={shop} community={c} size={96} />
        <div className="grid min-w-0 content-start gap-2">
          <h1 className="m-0 text-xl font-bold leading-snug [overflow-wrap:anywhere]">
            {shop.name}
            <KindTag shop={shop} />
          </h1>
          <div className="text-[13px] text-ink-2">
            {city.county}
            {city.name}・{shop.road ?? ""}
          </div>
          <ShopBadges shop={shop} community={c} />
          <ShopActions shop={shop} community={c} directions onContribute={() => setDialogKey(Date.now())} />
        </div>
      </section>

      <section className="gutter">
        <h2 className="mb-2 mt-4 text-base font-bold">客人分享的作品</h2>
        {v.photos.length ? (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {v.photos.map((p) => (
              <figure key={p.path} className="relative m-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- 使用者照片在 Supabase Storage */}
                <img src={photoUrl(p.path)} alt={`${shop.name} 的作品`} loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
                {p.price && (
                  <figcaption className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 text-[11px] text-white">
                    NT${p.price.toLocaleString()}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        ) : (
          <div className="grid justify-items-start gap-2 rounded-xl border border-dashed border-line bg-surface p-4 text-sm text-ink-2">
            還沒有人分享這家店的作品。
            <button type="button" onClick={() => setDialogKey(Date.now())} className="cursor-pointer rounded-full bg-brand px-4 py-1.5 font-semibold text-white">
              上傳第一張作品
            </button>
          </div>
        )}
      </section>

      <section className="gutter">
        <h2 className="mb-2 mt-6 text-base font-bold">店家資訊</h2>
        <dl className="m-0 grid grid-cols-[5em_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl bg-surface p-4 text-sm">
          {facts.map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="text-ink-3">{k}</dt>
              <dd className="m-0 [overflow-wrap:anywhere]">{val}</dd>
            </div>
          ))}
        </dl>
      </section>

      {shop.lat != null && (
        <section className="gutter">
          <h2 className="mb-2 mt-6 text-base font-bold">位置</h2>
          <div className="overflow-hidden rounded-xl">
            <ShopMap shops={[shop]} landmarks={city.landmarks} onSelect={() => {}} className="h-64" />
          </div>
          {shop.geoPrecision !== "address" && <p className="mt-1.5 text-xs text-ink-3">地圖位置為約略位置。</p>}
        </section>
      )}

      <p className="gutter mt-6 text-xs leading-relaxed text-ink-3">
        {vertical.sourceNote} 資料有誤？
        <button type="button" onClick={() => setDialogKey(Date.now())} className="cursor-pointer text-brand underline">
          幫忙更正
        </button>
        ・
        <Link href={`/${vertical.slug}/${city.slug}/`} className="text-brand underline">
          看{city.name}其他{vertical.name}店
        </Link>
      </p>

      {dialogKey != null && (
        <ContributeDialog key={dialogKey} target={{ shop }} onClose={() => setDialogKey(null)} />
      )}
    </main>
  );
}
