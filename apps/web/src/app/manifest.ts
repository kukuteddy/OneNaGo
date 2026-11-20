import type { MetadataRoute } from "next";
import { BASE_PATH, SITE } from "@/lib/site";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} ${SITE.nameEn}`,
    short_name: SITE.nameEn,
    description: SITE.tagline,
    lang: "zh-Hant-TW",
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    background_color: "#FEFDF9",
    theme_color: "#FF6827",
    icons: [
      { src: `${BASE_PATH}/icons/icon.svg`, sizes: "any", type: "image/svg+xml" },
      { src: `${BASE_PATH}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `${BASE_PATH}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
