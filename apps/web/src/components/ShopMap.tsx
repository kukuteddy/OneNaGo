"use client";

import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { Landmark, Shop } from "@/lib/types";

type Leaflet = typeof import("leaflet");

interface MapHandle {
  L: Leaflet;
  map: LeafletMap;
  markers: LayerGroup;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function drawMarkers(h: MapHandle, shops: Shop[], landmarks: Landmark[], onSelect: (s: Shop) => void) {
  h.markers.clearLayers();
  const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#FF6827";
  const pts: [number, number][] = [];
  for (const s of shops) {
    if (s.lat == null || s.lng == null) continue;
    pts.push([s.lat, s.lng]);
    h.L.circleMarker([s.lat, s.lng], {
      radius: s.ig ? 9 : 7,
      color: "#fff",
      weight: 2,
      fillColor: s.geoPrecision === "address" ? brand : "#a59d9a",
      fillOpacity: 1,
    })
      .on("click", (e) => {
        h.L.DomEvent.stopPropagation(e);
        onSelect(s);
      })
      .addTo(h.markers);
  }
  if (pts.length) h.map.fitBounds(pts, { padding: [30, 30], maxZoom: 16 });
  else if (landmarks[0]) h.map.setView([landmarks[0].lat, landmarks[0].lng], 14);
  setTimeout(() => h.map.invalidateSize(), 0);
}

/** 街道地圖（OpenStreetMap）。點標記回呼 onSelect；點空白處回呼 onSelect(null)。 */
export function ShopMap({
  shops,
  landmarks,
  onSelect,
  className = "h-[calc(100dvh-190px)] min-h-[360px]",
}: {
  shops: Shop[];
  landmarks: Landmark[];
  onSelect: (shop: Shop | null) => void;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<MapHandle | null>(null);
  const selectRef = useRef(onSelect);

  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  // 建立地圖（只做一次；Leaflet 只在瀏覽器載入）
  useEffect(() => {
    let disposed = false;
    let created: LeafletMap | null = null;
    import("leaflet").then((mod) => {
      if (disposed || !el.current) return;
      const L = ((mod as unknown as { default?: Leaflet }).default ?? mod) as Leaflet;
      const map = L.map(el.current);
      created = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(map);
      for (const lm of landmarks) {
        L.marker([lm.lat, lm.lng], {
          icon: L.divIcon({ className: "", html: `<span class="lm-label">${escapeHtml(lm.name)}</span>` }),
          interactive: false,
          keyboard: false,
        }).addTo(map);
      }
      map.on("click", () => selectRef.current(null));
      setHandle({ L, map, markers: L.layerGroup().addTo(map) });
    });
    return () => {
      disposed = true;
      created?.remove();
    };
  }, [landmarks]);

  // 地圖好了、或篩選結果改變 → 重畫標記
  useEffect(() => {
    if (handle) drawMarkers(handle, shops, landmarks, (s) => selectRef.current(s));
  }, [handle, shops, landmarks]);

  return <div ref={el} className={`z-0 bg-bg ${className}`} aria-label="店家地圖" />;
}
