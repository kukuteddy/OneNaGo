"use client";

import { useState } from "react";
import { SubmitError, submit } from "@/lib/submit";
import type { Shop } from "@/lib/types";
import { Field, FormDialog, inputClass, noteClass } from "./FormDialog";

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span aria-label={`${value} 顆星`} className="inline-flex text-gold" style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden className={i <= Math.round(value) ? "" : "opacity-25"}>
          ★
        </span>
      ))}
    </span>
  );
}

export function ReviewDialog({ shop, onClose }: { shop: Shop; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [nickname, setNickname] = useState("");
  const [visited, setVisited] = useState("");

  async function onSubmit(token: string | undefined) {
    if (!rating) throw new SubmitError("請選擇評分（1 到 5 顆星）");
    if (body.trim().length < 5) throw new SubmitError("請寫幾句心得（至少 5 個字）");
    await submit(
      "reviews",
      { merchant_id: shop.id, rating, body: body.trim(), nickname: nickname.trim() || null, visited_on: visited || null },
      { turnstileToken: token },
    );
  }

  return (
    <FormDialog
      title="寫評論"
      subtitle={shop.name}
      onClose={onClose}
      onSubmit={onSubmit}
      successMessage="收到了，謝謝！評論審核通過後就會公開。"
    >
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1.5 text-[13px] text-ink-2">評分</legend>
        <div className="flex gap-1" role="radiogroup" aria-label="評分">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={rating === i}
              aria-label={`${i} 顆星`}
              onClick={() => setRating(i)}
              className={`cursor-pointer text-3xl leading-none ${i <= rating ? "text-gold" : "text-line"}`}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <Field id="rv-body" label="心得（作品、服務、環境、價格都可以寫）">
        <textarea
          id="rv-body"
          className={`${inputClass} min-h-24 resize-y`}
          maxLength={1000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="rv-name" label="暱稱（選填）">
          <input id="rv-name" className={inputClass} maxLength={30} value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </Field>
        <Field id="rv-date" label="去的日期（選填）">
          <input id="rv-date" type="date" className={inputClass} value={visited} onChange={(e) => setVisited(e.target.value)} />
        </Field>
      </div>
      <p className={noteClass}>評論審核通過才會公開。請分享真實體驗，不要留下電話或個人資料。</p>
    </FormDialog>
  );
}
