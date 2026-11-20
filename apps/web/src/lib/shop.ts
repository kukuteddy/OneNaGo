import type { Community, Landmark, Shop } from "./types";

/** 兩點距離（公里）。 */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number | null): string {
  if (km == null) return "";
  return km < 1 ? `${Math.round((km * 1000) / 10) * 10}m` : `${km.toFixed(1)}km`;
}

export function shopDistance(shop: Shop, from: Landmark | undefined): number | null {
  return from && shop.lat != null && shop.lng != null ? distanceKm(from, { lat: shop.lat, lng: shop.lng }) : null;
}

/** 開業年資（年，可為小數）。 */
export function yearsOpen(shop: Shop, now = new Date()): number | null {
  if (!shop.established) return null;
  const ms = now.getTime() - new Date(shop.established).getTime();
  return ms / (365.25 * 24 * 3600 * 1000);
}

export const kindLabel = (k: Shop["kind"]) => (k === "studio" ? "工作室" : k === "mobile" ? "到府" : "實體店");

/** 店家＋使用者補充 → 實際顯示的值（IG、LINE 以官方資料優先）。 */
export function withCommunity(shop: Shop, c: Community | undefined) {
  return {
    ig: shop.ig ?? c?.ig ?? null,
    igFromCommunity: !shop.ig && !!c?.ig,
    line: shop.line ?? c?.line ?? null,
    price: c?.price ?? null,
    warning: c?.warning ?? shop.hints[0] ?? null,
    photos: c?.photos ?? [],
  };
}

/** 智能排序分數：資料越完整、越可信，越前面。 */
export function rankScore(shop: Shop, c: Community | undefined): number {
  const v = withCommunity(shop, c);
  const years = yearsOpen(shop) ?? 0;
  const rating = c?.rating ? (c.rating.avg - 3) * Math.min(c.rating.count, 10) * 2 : 0;
  return (
    (shop.claimed ? 35 : 0) +
    rating +
    (shop.sources.length > 1 ? 40 : 0) +
    (v.photos.length ? 30 : 0) +
    (v.ig ? 25 : 0) +
    (v.line ? 8 : 0) +
    (v.price ? 6 : 0) +
    (shop.geoPrecision === "address" ? 5 : 0) +
    Math.min(years, 10) * 2 -
    (v.warning ? 30 : 0)
  );
}

export const igUrl = (handle: string) => `https://www.instagram.com/${encodeURIComponent(handle)}/`;

export const lineUrl = (line: string) =>
  line.startsWith("http") ? line : `https://line.me/R/ti/p/${encodeURIComponent(line)}`;

export function mapsUrl(shop: Shop, directions = false): string {
  if (directions && shop.lat != null && shop.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shop.name} ${shop.address ?? ""}`)}`;
}
