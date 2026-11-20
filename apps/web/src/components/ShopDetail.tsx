"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCommunity } from "@/lib/community";
import { photoUrl, supabase } from "@/lib/supabase";
import { kindLabel, withCommunity, yearsOpen } from "@/lib/shop";
import type { City, Shop, Vertical } from "@/lib/types";
import { ClaimDialog } from "./ClaimDialog";
import { ContributeDialog } from "./ContributeDialog";
import { ReviewDialog, Stars } from "./ReviewDialog";
import { KindTag, ShopActions, ShopBadges, ShopThumb } from "./ShopParts";

const ShopMap = dynamic(() => import("./ShopMap").then((m) => m.ShopMap), { ssr: false });

const SOURCE_LABEL: Record<string, string> = {
  gov_open_data: "財政部稅籍登記",
  manual: "公開網路資訊",
};

interface Review {
  id: string;
  rating: number;
  body: string;
  nickname: string | null;
  visited_on: string | null;
  created_at: string;
}

type Dialog = { kind: "contribute" | "review" | "claim"; key: number } | null;

function useReviews(merchantId: string): Review[] {
  const [reviews, setReviews] = useState<Review[]>([]);
  useEffect(() => {
    let alive = true;
    supabase()
      .from("approved_reviews")
      .select("id,rating,body,nickname,visited_on,created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (alive) setReviews((data ?? []) as Review[]);
      });
    return () => {
      alive = false;
    };
  }, [merchantId]);
  return reviews;
}

const h2 = "mb-2 mt-6 flex items-baseline justify-between gap-2 text-base font-bold";
const textBtn = "cursor-pointer text-sm font-normal text-brand";

export function ShopDetail({ shop, city, vertical }: { shop: Shop; city: City; vertical: Vertical }) {
  const community = useCommunity([shop.id]);
  const c = community.get(shop.id);
  const v = withCommunity(shop, c);
  const reviews = useReviews(shop.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const open = (kind: NonNullable<Dialog>["kind"]) => setDialog({ kind, key: Date.now() });
  const close = () => setDialog(null);
  const years = yearsOpen(shop);

  const facts: [string, React.ReactNode][] = [["類型", kindLabel(shop.kind)], ["地址", shop.address ?? "未提供"]];
  if (shop.phone) facts.push(["電話", <span key="p" className="select-all tabular-nums">{shop.phone}</span>]);
  if (shop.established)
    facts.push(["開業", `${shop.established.slice(0, 7).replace("-", " 年 ")} 月（約 ${Math.floor(years ?? 0)} 年）`]);
  if (shop.registeredName && shop.registeredName !== shop.name) facts.push(["登記名稱", shop.registeredName]);
  facts.push(["資料來源", shop.sources.map((s) => SOURCE_LABEL[s] ?? s).join("、")]);

  return (
    <main className="mx-auto max-w-3xl pb-10">
      <section className="gutter grid grid-cols-[96px_minmax(0,1fr)] gap-4 py-4">
        <div className="grid content-start justify-items-center gap-1.5">
          <ShopThumb shop={shop} community={c} size={96} />
          {!shop.logoPath && !shop.claimed && (
            <button type="button" onClick={() => open("claim")} className="cursor-pointer text-[11px] text-brand">
              店家？上傳 Logo
            </button>
          )}
        </div>
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
          <ShopActions shop={shop} community={c} directions onContribute={() => open("contribute")} />
        </div>
      </section>

      <section className="gutter">
        <h2 className={h2}>
          客人分享的作品
          {v.photos.length > 0 && (
            <button type="button" className={textBtn} onClick={() => open("contribute")}>
              ＋ 上傳作品
            </button>
          )}
        </h2>
        {v.photos.length ? (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {v.photos.map((p) => (
              <figure key={p.path} className="relative m-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- 使用者照片在 Supabase Storage */}
                <img
                  src={photoUrl(p.path)}
                  alt={`${shop.name} 的作品`}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg object-cover"
                />
                {p.first && (
                  <span className="absolute left-1 top-1 rounded bg-brand px-1.5 text-[10px] text-white">首位分享</span>
                )}
                {(p.price || p.by) && (
                  <figcaption className="absolute inset-x-1 bottom-1 flex justify-between gap-1 text-[11px] text-white">
                    {p.by ? <span className="truncate rounded bg-black/55 px-1.5">📷 {p.by}</span> : <span />}
                    {p.price && <span className="shrink-0 rounded bg-black/55 px-1.5">NT${p.price.toLocaleString()}</span>}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        ) : (
          <div className="grid justify-items-start gap-2 rounded-xl border border-dashed border-line bg-surface p-4 text-sm text-ink-2">
            <span>
              <b className="text-ink">成為第一位分享這家店作品的人！</b>
              <br />
              你的照片會成為店家的大頭貼，並標示「首位分享」和你的署名。
            </span>
            <button
              type="button"
              onClick={() => open("contribute")}
              className="cursor-pointer rounded-full bg-brand px-4 py-1.5 font-semibold text-white"
            >
              上傳第一張作品
            </button>
          </div>
        )}
      </section>

      <section className="gutter">
        <h2 className={h2}>
          <span>
            評論
            {c?.rating && (
              <span className="ml-2 text-sm font-normal text-ink-2">
                <Stars value={c.rating.avg} /> {c.rating.avg.toFixed(1)}・{c.rating.count} 則
              </span>
            )}
          </span>
          <button type="button" className={textBtn} onClick={() => open("review")}>
            ✎ 寫評論
          </button>
        </h2>
        {reviews.length ? (
          <ul className="m-0 grid list-none gap-px overflow-hidden rounded-xl bg-line p-0">
            {reviews.map((r) => (
              <li key={r.id} className="grid gap-1 bg-surface p-4">
                <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
                  <span>
                    <Stars value={r.rating} /> <b className="ml-1 font-normal text-ink-2">{r.nickname || "匿名"}</b>
                  </span>
                  <span>{(r.visited_on ?? r.created_at).slice(0, 10)}</span>
                </div>
                <p className="m-0 whitespace-pre-line text-sm leading-relaxed [overflow-wrap:anywhere]">{r.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 rounded-xl bg-surface p-4 text-sm text-ink-2">
            還沒有評論。
            <button type="button" className={`${textBtn} ml-1`} onClick={() => open("review")}>
              分享你的體驗
            </button>
          </p>
        )}
      </section>

      <section className="gutter">
        <h2 className={h2}>店家資訊</h2>
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
          <h2 className={h2}>位置</h2>
          <div className="overflow-hidden rounded-xl">
            <ShopMap shops={[shop]} landmarks={city.landmarks} onSelect={() => {}} className="h-64" />
          </div>
          {shop.geoPrecision !== "address" && <p className="mt-1.5 text-xs text-ink-3">地圖位置為約略位置。</p>}
        </section>
      )}

      {!shop.claimed && (
        <section className="gutter">
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper p-4">
            <div className="text-sm">
              <b>你是這家店的老闆或美甲師嗎？</b>
              <p className="m-0 mt-0.5 text-xs text-ink-2">免費認領，更新資料、作品和價格，排序更前面。</p>
            </div>
            <button
              type="button"
              onClick={() => open("claim")}
              className="cursor-pointer rounded-full border border-brand px-4 py-1.5 text-sm text-brand"
            >
              認領這家店
            </button>
          </div>
        </section>
      )}

      <p className="gutter mt-6 text-xs leading-relaxed text-ink-3">
        {vertical.sourceNote} 資料有誤？
        <button type="button" onClick={() => open("contribute")} className="cursor-pointer text-brand underline">
          幫忙更正
        </button>
        ・
        <Link href={`/${vertical.slug}/${city.slug}/`} className="text-brand underline">
          看{city.name}其他{vertical.name}店
        </Link>
      </p>

      {dialog?.kind === "contribute" && <ContributeDialog key={dialog.key} target={{ shop }} onClose={close} />}
      {dialog?.kind === "review" && <ReviewDialog key={dialog.key} shop={shop} onClose={close} />}
      {dialog?.kind === "claim" && <ClaimDialog key={dialog.key} shop={shop} onClose={close} />}
    </main>
  );
}
