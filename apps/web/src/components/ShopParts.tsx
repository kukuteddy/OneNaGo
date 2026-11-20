import { photoUrl } from "@/lib/supabase";
import { igUrl, kindLabel, lineUrl, mapsUrl, withCommunity, yearsOpen } from "@/lib/shop";
import type { Community, Shop } from "@/lib/types";

function hue(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  return h;
}

function initial(name: string): string {
  return name.match(/[一-鿿A-Za-z]/)?.[0]?.toUpperCase() ?? "店";
}

export function ShopThumb({ shop, community, size = 88 }: { shop: Shop; community?: Community; size?: number }) {
  const v = withCommunity(shop, community);
  const photo = v.photos[0];
  // 大頭貼優先順序：店家 Logo → 客人作品照 → 文字頭像
  const image = shop.logoPath
    ? { src: photoUrl(shop.logoPath), alt: `${shop.name} 的 Logo` }
    : photo
      ? { src: photoUrl(photo.path), alt: `${shop.name} 的作品` }
      : null;
  return (
    <div
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-lg font-bold text-white"
      style={{ width: size, height: size, fontSize: size / 3, background: `hsl(${hue(shop.name)} 45% 62%)` }}
    >
      {initial(shop.name)}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- 使用者照片放在 Supabase Storage，靜態輸出不經 next/image
        <img
          src={image.src}
          alt={image.alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {size >= 72 && !(shop.logoPath && !photo && !v.ig) && (
        <small className="absolute inset-x-0 bottom-0 bg-black/30 py-0.5 text-center text-[10px] font-normal">
          {photo ? `作品 ${v.photos.length} 張` : v.ig ? "看 IG 作品" : "暫無作品"}
        </small>
      )}
    </div>
  );
}

function Chip({ tone = "plain", children }: { tone?: "plain" | "gold" | "ok" | "brand" | "warn"; children: React.ReactNode }) {
  const tones = {
    plain: "bg-bg text-ink-2",
    gold: "bg-gold-soft text-gold",
    ok: "bg-ok-soft text-ok",
    brand: "bg-brand-soft text-brand",
    warn: "border border-dashed border-warn text-warn",
  } as const;
  return <span className={`rounded px-1.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function ShopBadges({ shop, community }: { shop: Shop; community?: Community }) {
  const v = withCommunity(shop, community);
  const years = yearsOpen(shop);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shop.claimed && <Chip tone="ok">✓ 店家已認領</Chip>}
      {community?.rating && (
        <Chip tone="gold">
          ★ {community.rating.avg.toFixed(1)}（{community.rating.count} 則評論）
        </Chip>
      )}
      {years != null &&
        (years < 1 ? <Chip tone="brand">新開幕</Chip> : <Chip tone="gold">開業 {Math.floor(years)} 年</Chip>)}
      {shop.sources.length > 1 && <Chip tone="ok">多來源核對</Chip>}
      {v.ig && (
        <Chip>
          {v.igFromCommunity ? "IG（客人回報）" : shop.igSource === "search" ? "IG（自動比對）" : "IG 作品"}
        </Chip>
      )}
      {v.line && <Chip>LINE 預約</Chip>}
      {v.price && <Chip tone="brand">約 NT${v.price.toLocaleString()}（客人回報）</Chip>}
      {v.photos.length > 0 && <Chip>客人作品 {v.photos.length}</Chip>}
      {v.warning && <Chip tone="warn">{v.warning}</Chip>}
      {shop.lat == null && <Chip tone="warn">待補地址</Chip>}
    </div>
  );
}

const pill = "rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap";

export function ShopActions({
  shop,
  community,
  directions = false,
  onContribute,
}: {
  shop: Shop;
  community?: Community;
  directions?: boolean;
  onContribute?: () => void;
}) {
  const v = withCommunity(shop, community);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {v.ig && (
        <a className={`${pill} border-brand bg-brand text-white`} href={igUrl(v.ig)} target="_blank" rel="noopener">
          看作品
        </a>
      )}
      {v.line && (
        <a className={`${pill} border-brand text-brand`} href={lineUrl(v.line)} target="_blank" rel="noopener">
          LINE
        </a>
      )}
      <a className={`${pill} border-brand text-brand`} href={mapsUrl(shop, directions)} target="_blank" rel="noopener">
        {directions ? "導航" : "地圖・評論"}
      </a>
      {onContribute && (
        <button type="button" className={`${pill} cursor-pointer border-dashed border-ink-3 text-ink-2`} onClick={onContribute}>
          補充資訊
        </button>
      )}
      {shop.phone && <span className="select-all text-xs text-ink-3 tabular-nums">{shop.phone}</span>}
    </div>
  );
}

export function KindTag({ shop }: { shop: Shop }) {
  return (
    <span className="ml-1 rounded-sm border border-line px-1 align-[2px] text-[11px] font-normal text-ink-2">
      {kindLabel(shop.kind)}
    </span>
  );
}
