"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useCommunity } from "@/lib/community";
import { asset } from "@/lib/site";
import { formatDistance, rankScore, shopDistance, withCommunity, yearsOpen } from "@/lib/shop";
import type { City, Shop, Vertical } from "@/lib/types";
import { ContributeDialog, type ContributeTarget } from "./ContributeDialog";
import { KindTag, ShopActions, ShopBadges, ShopThumb } from "./ShopParts";

const ShopMap = dynamic(() => import("./ShopMap").then((m) => m.ShopMap), {
  ssr: false,
  loading: () => <div className="grid h-[60dvh] place-items-center text-ink-2">地圖載入中…</div>,
});

const PAGE = 30;
type Sort = "rec" | "dist" | "old" | "new";

const TABS: { id: string; label: string; test: (s: Shop, ig: boolean) => boolean }[] = [
  { id: "all", label: "全部", test: () => true },
  { id: "ig", label: "有 IG 作品", test: (_s, ig) => ig },
  { id: "verified", label: "已核對", test: (s) => s.sources.length > 1 },
  { id: "new", label: "新開幕", test: (s) => (yearsOpen(s) ?? 99) < 1 },
  { id: "veteran", label: "老店 5 年+", test: (s) => (yearsOpen(s) ?? 0) >= 5 },
];

export function ShopExplorer({ vertical, city, shops }: { vertical: Vertical; city: City; shops: Shop[] }) {
  const community = useCommunity();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState<Sort>("rec");
  const [from, setFrom] = useState(0);
  const [shown, setShown] = useState(PAGE);
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<Shop | null>(null);
  const [contribute, setContribute] = useState<{ key: number; target: ContributeTarget } | null>(null);

  const landmark = city.landmarks[from];
  const openContribute = useCallback(
    (target: ContributeTarget) => setContribute({ key: Date.now(), target }),
    [],
  );

  const hasIg = useCallback((s: Shop) => !!withCommunity(s, community.get(s.id)).ig, [community]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const t = TABS.find((x) => x.id === tab)!;
    const list = shops
      .filter((s) => t.test(s, hasIg(s)))
      .filter((s) => !kind || s.kind === kind)
      .filter(
        (s) =>
          !needle ||
          `${s.name} ${s.registeredName ?? ""} ${s.address ?? ""} ${s.ig ?? ""}`.toLowerCase().includes(needle),
      )
      .map((s) => ({ shop: s, dist: shopDistance(s, landmark) }));
    const by: Record<Sort, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      rec: (a, b) => rankScore(b.shop, community.get(b.shop.id)) - rankScore(a.shop, community.get(a.shop.id)),
      dist: (a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9),
      old: (a, b) => (yearsOpen(b.shop) ?? -1) - (yearsOpen(a.shop) ?? -1),
      new: (a, b) => (yearsOpen(a.shop) ?? 1e9) - (yearsOpen(b.shop) ?? 1e9),
    };
    return list.sort((a, b) => by[sort](a, b) || a.shop.name.localeCompare(b.shop.name, "zh-Hant"));
  }, [shops, q, tab, kind, sort, landmark, community, hasIg]);

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.id, shops.filter((s) => t.test(s, hasIg(s))).length])),
    [shops, hasIg],
  );
  const mapShops = useMemo(() => rows.map((r) => r.shop), [rows]);
  const select = "max-w-full cursor-pointer appearance-none bg-transparent py-2.5 pl-1.5 pr-4 text-center text-ink";
  // 下拉箭頭：外層縮到跟 select 一樣寬，箭頭放在右側內距裡
  const caret =
    "relative max-w-full after:pointer-events-none after:absolute after:right-1 after:top-1/2 after:-mt-[2px] " +
    "after:border-4 after:border-transparent after:border-t-ink-3 after:content-['']";

  return (
    <>
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-10 border-b border-line bg-surface">
        <div className="mx-auto max-w-3xl">
          <div className="gutter flex items-center gap-2.5 pb-1.5 pt-2.5">
            <Link href="/" aria-label="玩哪走 首頁" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- 靜態輸出 */}
              <img src={asset("/icons/icon.svg")} alt="" width={34} height={34} className="rounded-[9px]" />
            </Link>
            <div className="whitespace-nowrap text-base font-bold">
              {city.name}
              <Link href="/" className="block text-[11px] font-normal text-ink-3">
                {vertical.name} ▾
              </Link>
            </div>
            <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-bg px-3.5 py-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0 text-ink-3" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setShown(PAGE);
                }}
                placeholder="搜尋店名、路名"
                aria-label="搜尋店名、路名"
                className="w-full min-w-0 bg-transparent outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setView(view === "list" ? "map" : "list");
                setSelected(null);
              }}
              className="grid shrink-0 cursor-pointer justify-items-center gap-px px-1 text-[11px] text-ink-2"
            >
              {view === "list" ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ink" aria-hidden>
                  <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
                  <circle cx="12" cy="9.5" r="2.5" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ink" aria-hidden>
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
              {view === "list" ? "地圖" : "列表"}
            </button>
          </div>

          <nav className="gutter flex gap-5 overflow-x-auto pt-1 [scrollbar-width:none]" aria-label="快速篩選">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  setShown(PAGE);
                }}
                className={`relative cursor-pointer whitespace-nowrap pb-2.5 pt-2 text-[15px] ${
                  tab === t.id
                    ? "font-bold text-ink after:absolute after:inset-x-[20%] after:bottom-1 after:h-[3px] after:rounded after:bg-brand"
                    : "text-ink-2"
                }`}
              >
                {t.label}
                <span className="ml-0.5 text-[11px] font-normal text-ink-3">{counts[t.id]}</span>
              </button>
            ))}
          </nav>

          <div className="gutter grid grid-cols-3 justify-items-center border-t border-line">
            <span className={caret}>
              <select
                aria-label="距離起點"
                className={select}
                value={from}
                onChange={(e) => {
                  setFrom(+e.target.value);
                  if (sort === "rec") setSort("dist");
                }}
              >
                {city.landmarks.map((l, i) => (
                  <option key={l.name} value={i}>
                    {l.name}
                  </option>
                ))}
              </select>
            </span>
            <span className={caret}>
              <select
                aria-label="類型"
                className={select}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setShown(PAGE);
                }}
              >
                <option value="">全部類型</option>
                <option value="shop">實體店</option>
                <option value="studio">工作室</option>
              </select>
            </span>
            <span className={caret}>
              <select aria-label="排序" className={select} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="rec">智能排序</option>
                <option value="dist">離我最近</option>
                <option value="old">開業最久</option>
                <option value="new">最新開業</option>
              </select>
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl">
        <div className="gutter flex flex-wrap justify-between gap-2 py-2.5 text-xs text-ink-2">
          <span>
            {rows.length} 家店{landmark ? `・距離以「${landmark.name}」計算` : ""}
          </span>
          <button
            type="button"
            className="cursor-pointer text-brand"
            onClick={() => openContribute({ newShop: { vertical: vertical.slug, cityName: city.name } })}
          >
            ＋ 新增店家
          </button>
        </div>

        {view === "list" ? (
          <section className="grid gap-px border-y border-line bg-line">
            {rows.length === 0 && (
              <p className="m-0 bg-surface px-4 py-10 text-center text-ink-2">沒有符合條件的店家，換個關鍵字或篩選試試</p>
            )}
            {rows.slice(0, shown).map(({ shop, dist }) => {
              const c = community.get(shop.id);
              return (
                <article key={shop.id} className="gutter grid grid-cols-[88px_minmax(0,1fr)] gap-3 bg-surface py-3.5">
                  <Link href={`/shop/${shop.shortId}/`} aria-label={shop.name}>
                    <ShopThumb shop={shop} community={c} />
                  </Link>
                  <div className="grid min-w-0 content-start gap-1.5">
                    <Link href={`/shop/${shop.shortId}/`} className="text-base font-bold leading-snug [overflow-wrap:anywhere]">
                      {shop.name}
                      <KindTag shop={shop} />
                    </Link>
                    {shop.registeredName && shop.registeredName !== shop.name && (
                      <div className="text-xs text-ink-3">登記名稱：{shop.registeredName}</div>
                    )}
                    <div className="flex justify-between gap-2 text-[13px] text-ink-2">
                      <span className="min-w-0 truncate">{shop.road || shop.address || "地址未提供"}</span>
                      <span className="shrink-0 tabular-nums">{formatDistance(dist)}</span>
                    </div>
                    <ShopBadges shop={shop} community={c} />
                    <ShopActions shop={shop} community={c} onContribute={() => openContribute({ shop })} />
                  </div>
                </article>
              );
            })}
            {rows.length > shown && (
              <button type="button" onClick={() => setShown(shown + PAGE)} className="cursor-pointer bg-surface p-3.5 text-brand">
                再顯示 {Math.min(PAGE, rows.length - shown)} 家（共 {rows.length} 家）
              </button>
            )}
          </section>
        ) : (
          <section className="relative">
            <ShopMap shops={mapShops} landmarks={city.landmarks} onSelect={setSelected} />
            {!selected && (
              <div className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 whitespace-nowrap rounded-full bg-surface px-3 py-1.5 text-xs text-ink-2 shadow">
                {mapShops.length ? `${mapShops.length} 家店・點標記看店家` : "沒有符合條件的店家"}
              </div>
            )}
            {selected && (
              <div className="absolute inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom,0px))] z-[500] grid grid-cols-[64px_minmax(0,1fr)_auto] items-start gap-3 rounded-xl bg-surface p-3 shadow-xl">
                <ShopThumb shop={selected} community={community.get(selected.id)} size={64} />
                <div className="grid min-w-0 gap-1.5">
                  <Link href={`/shop/${selected.shortId}/`} className="font-bold">
                    {selected.name}
                    <KindTag shop={selected} />
                  </Link>
                  <div className="flex justify-between gap-2 text-[13px] text-ink-2">
                    <span className="truncate">{selected.road || selected.address}</span>
                    <span className="shrink-0">{formatDistance(shopDistance(selected, landmark))}</span>
                  </div>
                  <ShopBadges shop={selected} community={community.get(selected.id)} />
                  <ShopActions
                    shop={selected}
                    community={community.get(selected.id)}
                    directions
                    onContribute={() => openContribute({ shop: selected })}
                  />
                </div>
                <button type="button" aria-label="關閉" onClick={() => setSelected(null)} className="cursor-pointer px-1 text-[22px] leading-none text-ink-3">
                  ×
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="gutter mx-auto max-w-3xl pb-7 pt-4.5 text-xs leading-relaxed text-ink-3">
        <b>玩哪走 OneNaGo</b>・台灣在地生活指南
        <br />
        {vertical.sourceNote} 招牌名稱、IG 與營業狀況以店家公告為準。
      </footer>

      {contribute && (
        <ContributeDialog key={contribute.key} target={contribute.target} onClose={() => setContribute(null)} />
      )}
    </>
  );
}
