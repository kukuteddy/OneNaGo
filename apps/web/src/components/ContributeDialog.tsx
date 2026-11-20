"use client";

import { useEffect, useRef, useState } from "react";
import { MIN_REPORTERS } from "@/lib/community";
import { supabase } from "@/lib/supabase";
import type { Shop } from "@/lib/types";

type Kind = "photo" | "ig" | "line" | "price" | "closed" | "moved" | "wrong" | "new_shop";

const KINDS: { value: Exclude<Kind, "new_shop">; label: string }[] = [
  { value: "photo", label: "上傳作品照片" },
  { value: "ig", label: "IG 帳號" },
  { value: "line", label: "LINE" },
  { value: "price", label: "價格" },
  { value: "closed", label: "已歇業" },
  { value: "moved", label: "已搬家" },
  { value: "wrong", label: "其他資料有誤" },
];

const show = (kind: Kind, ...on: Kind[]) => on.includes(kind);

export type ContributeTarget = { shop: Shop } | { newShop: { vertical: string; cityName: string } };

function clientId(): string | null {
  try {
    let id = localStorage.getItem("onenago_cid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("onenago_cid", id);
    }
    return id;
  } catch {
    return null;
  }
}

export function igHandle(v: string): string {
  const s = v.trim().split("?")[0]!.replace(/\/+$/, "");
  const path = s.includes("instagram.com/") ? s.split("instagram.com/")[1]!.split("/")[0]! : s;
  const m = path.match(/^@?([A-Za-z0-9_.]{1,30})$/);
  return m && !["p", "reel", "reels", "explore", "stories"].includes(m[1]!.toLowerCase()) ? m[1]!.toLowerCase() : "";
}

/** 縮到最長邊 1600px 的 JPEG；重新繪製也會去掉 EXIF（含拍攝地點）。 */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const s = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * s);
  canvas.height = Math.round(img.height * s);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("照片處理失敗"))), "image/jpeg", 0.85));
}

/** 每次開啟都重新掛載（呼叫端用 key 區分），所以表單狀態一律從初始值開始。 */
export function ContributeDialog({ target, onClose }: { target: ContributeTarget; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const shop = "shop" in target ? target.shop : null;
  const [kind, setKind] = useState<Kind>(shop ? (shop.ig ? "photo" : "ig") : "new_shop");
  const [value, setValue] = useState("");
  const [price, setPrice] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "err" | ""; msg: string }>({ tone: "", msg: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fail = (msg: string) => setStatus({ tone: "err", msg });
    const row: Record<string, unknown> = {
      merchant_id: shop ? shop.id : `new:${"newShop" in target ? `${target.newShop.vertical}:${target.newShop.cityName}` : ""}`,
      merchant_name: shop?.name ?? null,
      kind,
      client_id: clientId(),
    };
    if (kind === "ig") {
      const h = igHandle(value);
      if (!h) return fail("請填 IG 帳號，例如 @shop_nail");
      row.value = h;
    }
    if (kind === "line") {
      if (!value.trim()) return fail("請填 LINE ID 或加好友網址");
      row.value = value.trim().slice(0, 200);
    }
    if (kind === "price" || kind === "photo") {
      const p = Number.parseInt(price, 10);
      if (Number.isFinite(p)) {
        if (p < 100 || p > 20000) return fail("價格請填 100 到 20000 之間");
        row.price_twd = p;
      } else if (kind === "price") return fail("請填價格");
    }
    if (kind === "wrong" || kind === "moved" || kind === "new_shop") {
      if (!text.trim() && kind !== "moved") return fail("請簡單說明一下");
      row.value = text.trim() || null;
    }
    if (kind === "photo" && !file) return fail("請先選一張照片");

    setBusy(true);
    setStatus({ tone: "", msg: "送出中…" });
    try {
      if (kind === "photo" && file) {
        const name = `${crypto.randomUUID()}.jpg`;
        const { error } = await supabase()
          .storage.from("ugc-photos")
          .upload(`u/${name}`, await shrink(file), { contentType: "image/jpeg" });
        if (error) throw new Error("照片上傳失敗");
        row.photo_path = name;
      }
      const { error } = await supabase().from("reports").insert(row);
      if (error) throw new Error("送出失敗");
      setStatus({
        tone: "ok",
        msg: ["photo", "wrong", "new_shop"].includes(kind)
          ? "收到了，謝謝！審核通過後就會出現在頁面上。"
          : `收到了，謝謝！${MIN_REPORTERS} 個人以上回報相同內容就會自動顯示。`,
      });
      setTimeout(onClose, 2500);
    } catch (err) {
      setBusy(false);
      fail(`${(err as Error).message}，請稍後再試一次`);
    }
  }

  const input = "w-full min-w-0 rounded-[10px] border border-line bg-bg px-3 py-2.5 text-[15px] text-ink";
  const note = "m-0 text-xs leading-relaxed text-ink-3";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="cf-title"
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/45"
    >
      <form onSubmit={submit} className="grid gap-3.5 p-5">
        <h3 id="cf-title" className="m-0 text-[17px] font-bold">
          補充資訊
          <small className="mt-0.5 block text-[13px] font-normal text-ink-2">
            {shop ? shop.name : "newShop" in target ? `${target.newShop.cityName}・告訴我們還有哪家店` : ""}
          </small>
        </h3>

        {shop && (
          <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0" aria-label="要補充什麼">
            {KINDS.map((k) => (
              <label
                key={k.value}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
                  kind === k.value ? "border-brand bg-brand-soft text-brand" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={k.value}
                  checked={kind === k.value}
                  onChange={() => setKind(k.value)}
                  className="pointer-events-none absolute opacity-0"
                />
                {k.label}
              </label>
            ))}
          </fieldset>
        )}

        {show(kind, "photo") && (
          <div className="grid gap-1.5 text-[13px] text-ink-2">
            <label htmlFor="cf-file">作品照片（jpg / png，會自動壓縮）</label>
            <input
              id="cf-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element -- 本機預覽（blob URL）
              <img src={preview} alt="" className="h-24 w-24 rounded-lg object-cover" />
            )}
          </div>
        )}
        {show(kind, "ig", "line") && (
          <div className="grid gap-1.5 text-[13px] text-ink-2">
            <label htmlFor="cf-value">帳號或網址</label>
            <input
              id="cf-value"
              className={input}
              maxLength={200}
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === "ig" ? "例：@shop_nail 或 https://instagram.com/…" : "例：@shopline 或 https://lin.ee/…"}
            />
          </div>
        )}
        {show(kind, "price", "photo") && (
          <div className="grid gap-1.5 text-[13px] text-ink-2">
            <label htmlFor="cf-price">價格（新台幣{kind === "photo" ? "，選填" : ""}）</label>
            <input
              id="cf-price"
              className={input}
              type="number"
              inputMode="numeric"
              min={100}
              max={20000}
              step={10}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="例：1200"
            />
          </div>
        )}
        {show(kind, "wrong", "moved", "new_shop") && (
          <div className="grid gap-1.5 text-[13px] text-ink-2">
            <label htmlFor="cf-text">
              {kind === "new_shop" ? "店名、地址、IG（知道多少寫多少）" : kind === "moved" ? "新地址（知道的話）" : "哪裡有誤？正確的是什麼？"}
            </label>
            <textarea
              id="cf-text"
              className={`${input} min-h-20 resize-y`}
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        )}

        {show(kind, "photo") && (
          <p className={note}>照片需經審核才會顯示。上傳即表示照片是你自己拍的，同意公開顯示在玩哪走。我們會移除照片裡的拍攝地點等資訊。</p>
        )}
        {show(kind, "ig", "line", "closed", "moved") && (
          <p className={note}>{MIN_REPORTERS} 個人以上回報相同內容，就會自動顯示。</p>
        )}

        <p role="status" className={`m-0 text-sm ${status.tone === "ok" ? "text-ok" : status.tone === "err" ? "text-danger" : ""}`}>
          {status.msg}
        </p>
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-full border border-line px-4.5 py-2">
            取消
          </button>
          <button
            type="submit"
            disabled={busy}
            className="cursor-pointer rounded-full border border-brand bg-brand px-4.5 py-2 font-semibold text-white disabled:cursor-wait disabled:opacity-50"
          >
            送出
          </button>
        </div>
      </form>
    </dialog>
  );
}
