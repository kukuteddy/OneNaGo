import type { MetadataRoute } from "next";
import { getData, getListings } from "@/lib/data";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, { shops }] = await Promise.all([getListings(), getData()]);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    ...listings.flatMap((l) => [
      { url: `${SITE_URL}/${l.vertical.slug}/${l.city.slug}/`, changeFrequency: "weekly" as const, priority: 0.8 },
      { url: `${SITE_URL}/${l.vertical.slug}/${l.city.slug}/works/`, changeFrequency: "daily" as const, priority: 0.6 },
    ]),
    ...shops.map((s) => ({ url: `${SITE_URL}/shop/${s.shortId}/`, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
