import Link from "next/link";
import { getData, getListings } from "@/lib/data";
import { SITE, asset } from "@/lib/site";

export default async function Home() {
  const [listings, { shops }] = await Promise.all([getListings(), getData()]);
  const byVertical = Map.groupBy(listings, (l) => l.vertical.slug);

  return (
    <>
      <header className="border-b border-line bg-paper">
        <div className="gutter mx-auto grid max-w-[880px] items-center gap-6 py-7 sm:grid-cols-2">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element -- 靜態輸出 */}
            <img src={asset("/icons/logo-pin.svg")} alt="" width={72} height={82} />
            <h1 className="mb-1 mt-3.5 text-[clamp(34px,7vw,52px)] font-black leading-[1.05] tracking-wide [text-wrap:balance]">
              {SITE.name}
              <span className="mt-1.5 block text-[0.62em] font-extrabold tracking-normal text-brand">{SITE.nameEn}</span>
            </h1>
            <p className="mt-2.5 text-lg text-ink-2">{SITE.tagline}</p>
            <div className="mt-4 h-[5px] w-[120px] rounded bg-brand" />
            <p className="mt-3.5 text-[13px] text-ink-2 tabular-nums">已收錄 {shops.length} 家店家，每週自動更新</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- 靜態輸出 */}
          <img
            src={asset("/hero.webp")}
            alt="台灣騎樓街景"
            className="aspect-[16/10] w-full max-w-full rounded-2xl object-cover sm:aspect-[4/5]"
          />
        </div>
      </header>

      <main className="gutter mx-auto grid max-w-[880px] gap-2 pb-8 pt-2">
        {[...byVertical.values()].map((items) => (
          <section key={items[0]!.vertical.slug}>
            <h2 className="mb-2.5 mt-5 flex items-center gap-2 text-[17px] font-bold before:h-4 before:w-1 before:rounded-sm before:bg-brand">
              {items[0]!.vertical.name}
            </h2>
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr))]">
              {items.map((l) => (
                <Link
                  key={l.city.slug}
                  href={`/${l.vertical.slug}/${l.city.slug}/`}
                  className="relative grid gap-0.5 rounded-xl border border-line bg-surface py-4 pl-4 pr-9 hover:border-brand focus-visible:border-brand"
                >
                  <b className="text-[17px]">{l.city.name}</b>
                  <span className="text-[13px] text-ink-2">
                    {l.city.county}・{l.count} 家
                  </span>
                  <i aria-hidden className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[22px] not-italic text-brand">
                    ›
                  </i>
                </Link>
              ))}
            </div>
          </section>
        ))}
        <p className="mt-1.5 text-[13px] text-ink-2">更多行業與城市陸續加入中。</p>
      </main>

      <footer className="gutter mx-auto max-w-[880px] pb-8 text-xs leading-relaxed text-ink-2">
        © {SITE.name} {SITE.nameEn}・資料來源為財政部稅籍登記與公開網路資訊，自動彙整，非合作店家。
      </footer>
    </>
  );
}
