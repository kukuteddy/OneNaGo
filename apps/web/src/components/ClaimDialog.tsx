"use client";

import { useState } from "react";
import { SubmitError, submit } from "@/lib/submit";
import type { Shop } from "@/lib/types";
import { Field, FormDialog, inputClass, noteClass } from "./FormDialog";

const ROLES = [
  { value: "owner", label: "老闆" },
  { value: "manager", label: "店長 / 員工" },
  { value: "artist", label: "駐店美甲師" },
] as const;

export function ClaimDialog({ shop, onClose }: { shop: Shop; onClose: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>("owner");
  const [contact, setContact] = useState("");
  const [proof, setProof] = useState("");

  async function onSubmit(token: string | undefined) {
    if (!name.trim()) throw new SubmitError("請填你的稱呼");
    if (contact.trim().length < 3) throw new SubmitError("請填聯絡方式（LINE、電話或 Email）");
    await submit(
      "claims",
      {
        merchant_id: shop.id,
        merchant_name: shop.name,
        owner_name: name.trim(),
        role,
        contact: contact.trim(),
        proof: proof.trim() || null,
      },
      { turnstileToken: token },
    );
  }

  return (
    <FormDialog
      title="認領這家店"
      subtitle={shop.name}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="送出申請"
      successMessage="申請已送出！我們會用你留的聯絡方式和你確認，通過後店家頁會顯示「店家已認領」。"
    >
      <p className="m-0 text-sm leading-relaxed text-ink-2">
        認領後可以更新店家資料、作品和價格，頁面會顯示「店家已認領」標章，排序也會更前面。免費。
      </p>
      <Field id="cl-name" label="你的稱呼">
        <input id="cl-name" className={inputClass} maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0" aria-label="你的身分">
        {ROLES.map((r) => (
          <label
            key={r.value}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
              role === r.value ? "border-brand bg-brand-soft text-brand" : "border-line"
            }`}
          >
            <input
              type="radio"
              name="role"
              value={r.value}
              checked={role === r.value}
              onChange={() => setRole(r.value)}
              className="pointer-events-none absolute opacity-0"
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      <Field id="cl-contact" label="聯絡方式（LINE ID、電話或 Email）">
        <input
          id="cl-contact"
          className={inputClass}
          maxLength={200}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          autoComplete="tel"
        />
      </Field>
      <Field id="cl-proof" label="證明（選填：店家 IG 帳號、統一編號等，方便我們確認）">
        <input id="cl-proof" className={inputClass} maxLength={500} value={proof} onChange={(e) => setProof(e.target.value)} />
      </Field>
      <p className={noteClass}>聯絡方式只有玩哪走管理者看得到，不會公開。</p>
    </FormDialog>
  );
}
