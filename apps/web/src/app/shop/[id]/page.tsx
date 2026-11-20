import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShopDetail } from "@/components/ShopDetail";
import { getCities, getData, getShop, getVerticals } from "@/lib/data";
import { SITE_URL } from "@/lib/site";
import { igUrl, kindLabel } from "@/lib/shop";

type Params = { id: string };

export const dynamicParams = false;

export async function generateStaticParams(): Promise<Params[]> {
  return (await getData()).shops.map((s) => ({ id: s.shortId }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const shop = await getShop((await params).id);
  if (!shop) return {};
  const city = (await getCities()).find((c) => c.slug === shop.citySlug);
  return {
    title: `${shop.name}（${city?.name ?? ""}）`,
    description: `${shop.name}：${city?.county ?? ""}${shop.road ?? ""}的${kindLabel(shop.kind)}。地址、地圖導航、IG 作品、LINE 預約與客人回報。`,
    alternates: { canonical: `/shop/${shop.shortId}/` },
  };
}

export default async function ShopPage({ params }: { params: Promise<Params> }) {
  const shop = await getShop((await params).id);
  if (!shop) notFound();
  const [cities, verticals] = await Promise.all([getCities(), getVerticals()]);
  const city = cities.find((c) => c.slug === shop.citySlug)!;
  const vertical = verticals.find((v) => shop.verticals.includes(v.slug)) ?? verticals[0]!;

  // 結構化資料：讓 Google 認得這是一家在地店家
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": vertical.slug === "nail" ? "NailSalon" : "LocalBusiness",
    name: shop.name,
    url: `${SITE_URL}/shop/${shop.shortId}/`,
    address: shop.address
      ? { "@type": "PostalAddress", streetAddress: shop.address, addressRegion: city.county, addressCountry: "TW" }
      : undefined,
    geo: shop.lat != null ? { "@type": "GeoCoordinates", latitude: shop.lat, longitude: shop.lng } : undefined,
    telephone: shop.phone ?? undefined,
    sameAs: shop.ig ? [igUrl(shop.ig)] : undefined,
    foundingDate: shop.established ?? undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        // 跳脫 <，避免店名裡的 </script> 截斷標籤
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <nav aria-label="麵包屑" className="gutter mx-auto max-w-3xl pt-3 text-xs text-ink-3">
        <Link href="/">玩哪走</Link> ›{" "}
        <Link href={`/${vertical.slug}/${city.slug}/`}>
          {city.name}
          {vertical.name}
        </Link>{" "}
        › <span className="text-ink-2">{shop.name}</span>
      </nav>
      <ShopDetail shop={shop} city={city} vertical={vertical} />
    </>
  );
}
