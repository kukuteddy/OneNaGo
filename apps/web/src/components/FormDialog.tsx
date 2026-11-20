"use client";

import { useEffect, useRef, useState } from "react";
import { SubmitError, TURNSTILE_ENABLED } from "@/lib/submit";
import { Turnstile } from "./Turnstile";

export const inputClass = "w-full min-w-0 rounded-[10px] border border-line bg-bg px-3 py-2.5 text-[15px] text-ink";
export const noteClass = "m-0 text-xs leading-relaxed text-ink-3";

export function Field({ id, label, children }: { id: string; label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 text-[13px] text-ink-2">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

/**
 * 投稿表單的共用外框：對話框、人機驗證、送出狀態、成功後自動關閉。
 * 每次開啟都重新掛載（呼叫端用 key 區分），表單狀態一律從初始值開始。
 */
export function FormDialog({
  title,
  subtitle,
  onClose,
  onSubmit,
  successMessage,
  submitLabel = "送出",
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  /** 驗證失敗就 throw SubmitError（訊息會顯示給使用者）。 */
  onSubmit: (turnstileToken: string | undefined) => Promise<void>;
  successMessage: string;
  submitLabel?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "err" | ""; msg: string }>({ tone: "", msg: "" });

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (TURNSTILE_ENABLED && !token) {
      setStatus({ tone: "err", msg: "請先完成下方的驗證" });
      return;
    }
    setBusy(true);
    setStatus({ tone: "", msg: "送出中…" });
    try {
      await onSubmit(token ?? undefined);
      setStatus({ tone: "ok", msg: successMessage });
      setTimeout(onClose, 2500);
    } catch (err) {
      setBusy(false);
      const msg = err instanceof SubmitError ? err.message : "送出失敗，請稍後再試一次";
      setStatus({ tone: "err", msg });
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="fd-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(440px,calc(100vw-32px))] rounded-2xl bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/45"
    >
      <form onSubmit={handle} className="grid gap-3.5 p-5">
        <h3 id="fd-title" className="m-0 text-[17px] font-bold">
          {title}
          {subtitle && <small className="mt-0.5 block text-[13px] font-normal text-ink-2">{subtitle}</small>}
        </h3>
        {children}
        <Turnstile onToken={setToken} />
        <p
          role="status"
          className={`m-0 min-h-5 text-sm ${status.tone === "ok" ? "text-ok" : status.tone === "err" ? "text-danger" : ""}`}
        >
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
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
