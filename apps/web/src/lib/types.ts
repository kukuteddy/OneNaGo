export type Kind = "shop" | "studio" | "mobile";
export type GeoPrecision = "address" | "lane" | "road" | "district";
export type IgSource = "manual" | "search" | "ugc";

export interface Landmark {
  name: string;
  lat: number;
  lng: number;
}

export interface City {
  slug: string;
  name: string;
  county: string;
  landmarks: Landmark[];
}

export interface Vertical {
  slug: string;
  name: string;
  sourceNote: string;
}

/** 店家（建置時從 Supabase 讀出、已整理成網站要用的形狀）。 */
export interface Shop {
  id: string;
  shortId: string;
  citySlug: string;
  verticals: string[];
  name: string;
  registeredName: string | null;
  kind: Kind;
  address: string | null;
  road: string | null;
  lat: number | null;
  lng: number | null;
  geoPrecision: GeoPrecision | null;
  phone: string | null;
  ig: string | null;
  igSource: IgSource | null;
  line: string | null;
  established: string | null; // YYYY-MM-DD
  sources: string[];
  hints: string[];
  claimed: boolean;
}

/** 使用者補充（瀏覽器端即時讀取後合併）。 */
export interface Community {
  ig?: string;
  line?: string;
  price?: number;
  warning?: string;
  photos: { path: string; price: number | null }[];
  rating?: { avg: number; count: number };
}
