import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopExplorer } from "@/components/ShopExplorer";
import { getListings, getShops } from "@/lib/data";

type Params = { vertical: string; city: string };

export const dynamicParams = false;

export async function generateStaticParams(): Promise<Params[]> {
  return (await getListings()).map((l) => ({ vertical: l.vertical.slug, city: l.city.slug }));
}

async function find(params: Promise<Params>) {
  const { vertical, city } = await params;
  return (await getListings()).find((l) => l.vertical.slug === vertical && l.city.slug === city) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const l = await find(params);
  if (!l) return {};
  const title = `${l.city.name}${l.vertical.name}推薦 ${l.count} 家`;
  return {
    title,
    description: `${l.city.county}${l.city.name}${l.vertical.name}店家一次比較：距離、開業年資、IG 作品、LINE 預約，共 ${l.count} 家。`,
    alternates: { canonical: `/${l.vertical.slug}/${l.city.slug}/` },
  };
}

export default async function ListingPage({ params }: { params: Promise<Params> }) {
  const l = await find(params);
  if (!l) notFound();
  const shops = await getShops(l.vertical.slug, l.city.slug);
  return <ShopExplorer vertical={l.vertical} city={l.city} shops={shops} />;
}
