import { supabase } from "./supabase";
import type { City, Shop, Vertical } from "./types";

/* 只在建置時（伺服器端）使用：從 Supabase 讀資料，同一次建置只讀一次。 */

const PAGE = 1000;

async function fetchAll<T>(
  table: string,
  columns: string,
  opts: { orderBy: string; activeOnly?: boolean },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase().from(table).select(columns);
    if (opts.activeOnly) q = q.eq("is_active", true);
    const { data, error } = await q.order(opts.orderBy).range(from, from + PAGE - 1);
    if (error) throw new Error(`讀取 ${table} 失敗：${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

interface MerchantRow {
  id: string;
  short_id: string;
  city_slug: string;
  name: string;
  registered_name: string | null;
  kind: Shop["kind"];
  address: string | null;
  road: string | null;
  lat: number | null;
  lng: number | null;
  geo_precision: Shop["geoPrecision"];
  phone: string | null;
  ig: string | null;
  ig_source: Shop["igSource"];
  line: string | null;
  established: string | null;
  sources: string[];
  hints: string[];
  claimed: boolean;
  merchant_verticals: { vertical_slug: string }[];
}

const MERCHANT_COLUMNS =
  "id,short_id,city_slug,name,registered_name,kind,address,road,lat,lng,geo_precision,phone,ig," +
  "ig_source,line,established,sources,hints,claimed,merchant_verticals(vertical_slug)";

let cache: Promise<{ verticals: Vertical[]; cities: City[]; shops: Shop[] }> | null = null;

async function load() {
  const [verticals, cities, merchants] = await Promise.all([
    fetchAll<{ slug: string; name: string; source_note: string | null }>("verticals", "slug,name,source_note", {
      orderBy: "sort",
    }),
    fetchAll<City>("cities", "slug,name,county,landmarks", { orderBy: "sort" }),
    fetchAll<MerchantRow>("merchants", MERCHANT_COLUMNS, { orderBy: "id", activeOnly: true }),
  ]);
  return {
    verticals: verticals.map((v) => ({ slug: v.slug, name: v.name, sourceNote: v.source_note ?? "" })),
    cities,
    shops: merchants.map(
      (m): Shop => ({
        id: m.id,
        shortId: m.short_id,
        citySlug: m.city_slug,
        verticals: m.merchant_verticals.map((v) => v.vertical_slug),
        name: m.name,
        registeredName: m.registered_name,
        kind: m.kind,
        address: m.address,
        road: m.road,
        lat: m.lat,
        lng: m.lng,
        geoPrecision: m.geo_precision,
        phone: m.phone,
        ig: m.ig,
        igSource: m.ig_source,
        line: m.line,
        established: m.established,
        sources: m.sources,
        hints: m.hints,
        claimed: m.claimed,
      }),
    ),
  };
}

export function getData() {
  cache ??= load();
  return cache;
}

export async function getVerticals() {
  return (await getData()).verticals;
}

export async function getCities() {
  return (await getData()).cities;
}

export async function getShops(vertical: string, city: string) {
  return (await getData()).shops.filter((s) => s.citySlug === city && s.verticals.includes(vertical));
}

export async function getShop(shortId: string) {
  return (await getData()).shops.find((s) => s.shortId === shortId) ?? null;
}

/** 有店家的（行業, 城市）組合 → 產生哪些列表頁。 */
export async function getListings() {
  const { verticals, cities, shops } = await getData();
  return verticals.flatMap((v) =>
    cities
      .map((c) => ({
        vertical: v,
        city: c,
        count: shops.filter((s) => s.citySlug === c.slug && s.verticals.includes(v.slug)).length,
      }))
      .filter((l) => l.count > 0),
  );
}
