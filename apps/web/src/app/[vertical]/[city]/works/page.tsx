import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WorksWall } from "@/components/WorksWall";
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
  return {
    title: `${l.city.name}${l.vertical.name}作品牆`,
    description: `${l.city.name}${l.vertical.name}客人實際分享的作品照片與價格，點照片直接看店家。`,
    alternates: { canonical: `/${l.vertical.slug}/${l.city.slug}/works/` },
  };
}

export default async function WorksPage({ params }: { params: Promise<Params> }) {
  const l = await find(params);
  if (!l) notFound();
  const shops = await getShops(l.vertical.slug, l.city.slug);
  return (
    <main className="mx-auto max-w-3xl pb-10">
      <nav aria-label="麵包屑" className="gutter pt-3 text-xs text-ink-3">
        <Link href="/">玩哪走</Link> ›{" "}
        <Link href={`/${l.vertical.slug}/${l.city.slug}/`}>
          {l.city.name}
          {l.vertical.name}
        </Link>{" "}
        › <span className="text-ink-2">作品牆</span>
      </nav>
      <h1 className="gutter mb-1 mt-3 text-xl font-bold">
        {l.city.name}
        {l.vertical.name}作品牆
      </h1>
      <p className="gutter m-0 mb-4 text-sm text-ink-2">客人實際做完分享的作品。看到喜歡的，點照片直接看是哪家店。</p>
      <WorksWall citySlug={l.city.slug} shopIds={shops.map((s) => s.shortId)} />
    </main>
  );
}
