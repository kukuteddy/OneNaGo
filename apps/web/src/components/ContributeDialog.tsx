"use client";

import { useEffect, useState } from "react";
import { MIN_REPORTERS } from "@/lib/community";
import { SubmitError, shrinkPhoto, submit } from "@/lib/submit";
import type { Shop } from "@/lib/types";
import { Field, FormDialog, inputClass, noteClass } from "./FormDialog";

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

export type ContributeTarget = { shop: Shop } | { newShop: { vertical: string; cityName: string } };

export function igHandle(v: string): string {
  const s = v.trim().split("?")[0]!.replace(/\/+$/, "");
  const path = s.includes("instagram.com/") ? s.split("instagram.com/")[1]!.split("/")[0]! : s;
  const m = path.match(/^@?([A-Za-z0-9_.]{1,30})$/);
  const h = m?.[1]?.toLowerCase() ?? "";
  return ["p", "reel", "reels", "explore", "stories"].includes(h) ? "" : h;
}

export function ContributeDialog({ target, onClose }: { target: ContributeTarget; onClose: () => void }) {
  const shop = "shop" in target ? target.shop : null;
  const [kind, setKind] = useState<Kind>(shop ? (shop.ig ? "photo" : "ig") : "new_shop");
  const [value, setValue] = useState("");
  const [price, setPrice] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [nickname, setNickname] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const on = (...ks: Kind[]) => ks.includes(kind);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function onSubmit(token: string | undefined) {
    const row: Record<string, unknown> = {
      merchant_id: shop ? shop.id : `new:${"newShop" in target ? `${target.newShop.vertical}:${target.newShop.cityName}` : ""}`,
      merchant_name: shop?.name ?? null,
      kind,
    };
    if (kind === "ig") {
      const h = igHandle(value);
      if (!h) throw new SubmitError("請填 IG 帳號，例如 @shop_nail");
      row.value = h;
    }
    if (kind === "line") {
      if (!value.trim()) throw new SubmitError("請填 LINE ID 或加好友網址");
      row.value = value.trim().slice(0, 200);
    }
    if (on("price", "photo")) {
      const p = Number.parseInt(price, 10);
      if (Number.isFinite(p)) {
        if (p < 100 || p > 20000) throw new SubmitError("價格請填 100 到 20000 之間");
        row.price_twd = p;
      } else if (kind === "price") throw new SubmitError("請填價格");
    }
    if (on("wrong", "moved", "new_shop")) {
      if (!text.trim() && kind !== "moved") throw new SubmitError("請簡單說明一下");
      row.value = text.trim() || null;
    }
    if (kind === "photo" && !file) throw new SubmitError("請先選一張照片");
    if (kind === "photo" && nickname.trim()) row.nickname = nickname.trim().slice(0, 30);
    await submit("reports", row, { photo: file ? await shrinkPhoto(file) : undefined, turnstileToken: token });
  }

  return (
    <FormDialog
      title={shop ? "補充資訊" : "新增店家"}
      subtitle={shop ? shop.name : "newShop" in target ? `${target.newShop.cityName}・告訴我們還有哪家店` : ""}
      onClose={onClose}
      onSubmit={onSubmit}
      successMessage={
        on("photo", "wrong", "new_shop")
          ? "收到了，謝謝！審核通過後就會出現在頁面上。"
          : `收到了，謝謝！${MIN_REPORTERS} 個人以上回報相同內容就會自動顯示。`
      }
    >
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

      {on("photo") && (
        <Field id="cf-file" label="作品照片（jpg / png，會自動壓縮）">
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
        </Field>
      )}
      {on("ig", "line") && (
        <Field id="cf-value" label="帳號或網址">
          <input
            id="cf-value"
            className={inputClass}
            maxLength={200}
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={kind === "ig" ? "例：@shop_nail 或 https://instagram.com/…" : "例：@shopline 或 https://lin.ee/…"}
          />
        </Field>
      )}
      {on("price", "photo") && (
        <Field id="cf-price" label={`價格（新台幣${kind === "photo" ? "，選填" : ""}）`}>
          <input
            id="cf-price"
            className={inputClass}
            type="number"
            inputMode="numeric"
            min={100}
            max={20000}
            step={10}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="例：1200"
          />
        </Field>
      )}
      {on("photo") && (
        <Field id="cf-nick" label="署名（選填，會顯示在作品旁，例如 IG 帳號或暱稱）">
          <input
            id="cf-nick"
            className={inputClass}
            maxLength={30}
            autoComplete="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </Field>
      )}
      {on("wrong", "moved", "new_shop") && (
        <Field
          id="cf-text"
          label={kind === "new_shop" ? "店名、地址、IG（知道多少寫多少）" : kind === "moved" ? "新地址（知道的話）" : "哪裡有誤？正確的是什麼？"}
        >
          <textarea
            id="cf-text"
            className={`${inputClass} min-h-20 resize-y`}
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
      )}

      {on("photo") && (
        <p className={noteClass}>
          照片需經審核才會顯示。上傳即表示照片是你自己拍的，同意公開顯示在玩哪走。我們會移除照片裡的拍攝地點等資訊。
        </p>
      )}
      {on("ig", "line", "closed", "moved") && (
        <p className={noteClass}>{MIN_REPORTERS} 個人以上回報相同內容，就會自動顯示。</p>
      )}
    </FormDialog>
  );
}
