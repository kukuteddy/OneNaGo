"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { adminClient, photoUrl } from "@/lib/supabase";
import { inputClass } from "./FormDialog";
import { Stars } from "./ReviewDialog";

type Table = "reports" | "reviews" | "claims";
type Status = "pending" | "approved" | "rejected";

interface Row {
  id: string;
  created_at: string;
  merchant_id: string;
  merchant_name?: string | null;
  status: Status;
  review_note: string | null;
  client_id: string | null;
  // reports
  kind?: string;
  value?: string | null;
  price_twd?: number | null;
  photo_path?: string | null;
  // reviews
  rating?: number;
  body?: string;
  nickname?: string | null;
  visited_on?: string | null;
  // claims
  owner_name?: string;
  role?: string | null;
  contact?: string;
  proof?: string | null;
}

const TABS: { id: Table; label: string }[] = [
  { id: "reports", label: "回報與照片" },
  { id: "reviews", label: "評論" },
  { id: "claims", label: "店家認領" },
];

const KIND_LABEL: Record<string, string> = {
  photo: "作品照片",
  ig: "IG",
  line: "LINE",
  price: "價格",
  closed: "已歇業",
  moved: "已搬家",
  wrong: "資料有誤",
  new_shop: "新增店家",
};

const ROLE_LABEL: Record<string, string> = { owner: "老闆", manager: "店長 / 員工", artist: "駐店美甲師" };

type ShopIndex = Record<string, { name: string; shortId: string }>;

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <form
      className="mx-auto mt-16 grid w-[min(360px,calc(100vw-32px))] gap-3 rounded-2xl bg-surface p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg("登入中…");
        const { error } = await adminClient().auth.signInWithPassword({ email, password });
        if (error) setMsg("登入失敗：Email 或密碼不正確");
        else onDone();
      }}
    >
      <h1 className="m-0 text-lg font-bold">玩哪走・管理審核</h1>
      <label className="grid gap-1 text-sm text-ink-2">
        Email
        <input type="email" required autoComplete="username" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="grid gap-1 text-sm text-ink-2">
        密碼
        <input
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <button type="submit" className="cursor-pointer rounded-full bg-brand py-2 font-semibold text-white">
        登入
      </button>
      <p role="status" className="m-0 min-h-5 text-sm text-danger">
        {msg}
      </p>
    </form>
  );
}

function Item({
  table,
  row,
  shops,
  onReview,
}: {
  table: Table;
  row: Row;
  shops: ShopIndex;
  onReview: (id: string, status: Status, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState(row.review_note ?? "");
  const [busy, setBusy] = useState(false);
  const shop = shops[row.merchant_id];
  const act = async (status: Status) => {
    setBusy(true);
    await onReview(row.id, status, note);
    setBusy(false);
  };

  return (
    <li className="grid gap-2 rounded-xl bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
        <span className="text-sm text-ink">
          {shop ? (
            <Link href={`/shop/${shop.shortId}/`} target="_blank" className="font-bold text-brand">
              {shop.name}
            </Link>
          ) : (
            <b>{row.merchant_name ?? row.merchant_id}</b>
          )}
          {row.kind && <span className="ml-2 rounded bg-bg px-1.5 py-0.5 text-xs text-ink-2">{KIND_LABEL[row.kind] ?? row.kind}</span>}
        </span>
        <span>
          {new Date(row.created_at).toLocaleString("zh-TW")}・{row.client_id?.slice(0, 8) ?? "—"}
        </span>
      </div>

      {table === "reports" && (
        <div className="grid gap-2 text-sm">
          {row.photo_path && (
            <a href={photoUrl(row.photo_path)} target="_blank" rel="noopener">
              {/* eslint-disable-next-line @next/next/no-img-element -- 待審核照片 */}
              <img src={photoUrl(row.photo_path)} alt="待審核照片" className="max-h-72 rounded-lg object-contain" />
            </a>
          )}
          {row.value && <p className="m-0 whitespace-pre-line [overflow-wrap:anywhere]">{row.value}</p>}
          {row.price_twd && <p className="m-0 text-brand">NT${row.price_twd.toLocaleString()}</p>}
        </div>
      )}
      {table === "reviews" && (
        <div className="grid gap-1 text-sm">
          <span>
            <Stars value={row.rating ?? 0} /> {row.nickname || "匿名"}
            {row.visited_on && <span className="ml-2 text-xs text-ink-3">去的日期 {row.visited_on}</span>}
          </span>
          <p className="m-0 whitespace-pre-line [overflow-wrap:anywhere]">{row.body}</p>
        </div>
      )}
      {table === "claims" && (
        <dl className="m-0 grid grid-cols-[4.5em_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-ink-3">稱呼</dt>
          <dd className="m-0">
            {row.owner_name}（{ROLE_LABEL[row.role ?? ""] ?? row.role}）
          </dd>
          <dt className="text-ink-3">聯絡</dt>
          <dd className="m-0 select-all [overflow-wrap:anywhere]">{row.contact}</dd>
          <dt className="text-ink-3">證明</dt>
          <dd className="m-0 [overflow-wrap:anywhere]">{row.proof || "—"}</dd>
        </dl>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="審核備註"
          placeholder="備註（選填）"
          className={`${inputClass} flex-1 py-1.5 text-sm`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {row.status !== "approved" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("approved")}
            className="cursor-pointer rounded-full bg-ok px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            通過
          </button>
        )}
        {row.status !== "rejected" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("rejected")}
            className="cursor-pointer rounded-full border border-danger px-4 py-1.5 text-sm text-danger disabled:opacity-50"
          >
            退回
          </button>
        )}
        {row.status !== "pending" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("pending")}
            className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm text-ink-2 disabled:opacity-50"
          >
            改回待審
          </button>
        )}
      </div>
    </li>
  );
}

export function AdminConsole({ shops }: { shops: ShopIndex }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [table, setTable] = useState<Table>("reports");
  const [status, setStatus] = useState<Status>("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, setPending] = useState<Record<Table, number>>({ reports: 0, reviews: 0, claims: 0 });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const sb = adminClient();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    adminClient()
      .rpc("is_admin")
      .then(({ data }) => {
        if (alive) setIsAdmin(data === true);
      });
    return () => {
      alive = false;
    };
  }, [session]);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const sb = adminClient();
    sb.from(table)
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: status === "pending" })
      .limit(100)
      .then(({ data }) => {
        if (alive) setRows((data ?? []) as Row[]);
      });
    Promise.all(
      TABS.map((t) => sb.from(t.id).select("id", { count: "exact", head: true }).eq("status", "pending")),
    ).then((res) => {
      if (alive) setPending({ reports: res[0]?.count ?? 0, reviews: res[1]?.count ?? 0, claims: res[2]?.count ?? 0 });
    });
    return () => {
      alive = false;
    };
  }, [isAdmin, table, status, reload]);

  const onReview = useCallback(
    async (id: string, next: Status, note: string) => {
      const { error } = await adminClient()
        .from(table)
        .update({ status: next, review_note: note || null })
        .eq("id", id);
      if (!error) setReload((n) => n + 1);
    },
    [table],
  );

  if (session === undefined) return <p className="p-10 text-center text-ink-2">載入中…</p>;
  if (!session) return <Login onDone={() => setReload((n) => n + 1)} />;
  if (isAdmin === false)
    return (
      <div className="p-10 text-center text-ink-2">
        <p>這個帳號沒有管理權限。</p>
        <button type="button" className="cursor-pointer text-brand underline" onClick={() => adminClient().auth.signOut()}>
          登出
        </button>
      </div>
    );

  return (
    <main className="mx-auto max-w-3xl pb-10">
      <header className="gutter flex items-center justify-between gap-3 py-4">
        <h1 className="m-0 text-lg font-bold">管理審核</h1>
        <span className="flex items-center gap-3 text-xs text-ink-3">
          {session.user.email}
          <button type="button" className="cursor-pointer text-brand" onClick={() => adminClient().auth.signOut()}>
            登出
          </button>
        </span>
      </header>
      <nav className="gutter flex flex-wrap gap-2" aria-label="審核類型">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={table === t.id}
            onClick={() => {
              setTable(t.id);
              setRows(null);
            }}
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm ${
              table === t.id ? "border-brand bg-brand-soft text-brand" : "border-line"
            }`}
          >
            {t.label}
            {pending[t.id] > 0 && <span className="ml-1.5 rounded-full bg-brand px-1.5 text-xs text-white">{pending[t.id]}</span>}
          </button>
        ))}
        <select
          aria-label="狀態"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as Status);
            setRows(null);
          }}
          className="ml-auto rounded-full border border-line bg-surface px-3 py-1.5 text-sm"
        >
          <option value="pending">待審核</option>
          <option value="approved">已通過</option>
          <option value="rejected">已退回</option>
        </select>
      </nav>
      <ul className="gutter m-0 mt-4 grid list-none gap-3 p-0">
        {rows === null && <li className="py-10 text-center text-ink-2">載入中…</li>}
        {rows?.length === 0 && <li className="py-10 text-center text-ink-2">沒有資料</li>}
        {rows?.map((r) => (
          <Item key={r.id} table={table} row={r} shops={shops} onReview={onReview} />
        ))}
      </ul>
    </main>
  );
}
