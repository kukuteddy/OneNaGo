"use client";

import { useEffect, useRef } from "react";
import { SITE } from "@/lib/site";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  loading ??= new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => fail(new Error("驗證元件載入失敗"));
    document.head.appendChild(s);
  });
  return loading;
}

/** Cloudflare Turnstile 人機驗證（免費、多數人不用點任何東西）。沒設定 siteKey 時不顯示。 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!SITE.turnstile.siteKey) return;
    let id: string | null = null;
    let cancelled = false;
    load()
      .then(() => {
        if (cancelled || !el.current || !window.turnstile) return;
        id = window.turnstile.render(el.current, {
          sitekey: SITE.turnstile.siteKey,
          language: "zh-tw",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, []);

  if (!SITE.turnstile.siteKey) return null;
  return <div ref={el} className="min-h-[65px]" />;
}
