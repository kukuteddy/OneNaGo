-- =====================================================================
-- 玩哪走 OneNaGo：使用者補充資訊（UGC）
-- 原則：任何人都能「送出」，但不能讀別人送的原始資料；
--       網站只讀「彙整後」的結果（report_summary）與「審核通過」的照片。
-- =====================================================================

create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  merchant_id   text not null check (length(merchant_id) between 1 and 64),
  merchant_name text check (length(merchant_name) <= 100),
  kind          text not null check (kind in ('ig', 'line', 'price', 'closed', 'moved', 'wrong', 'photo', 'new_shop')),
  value         text check (length(value) <= 500),
  price_twd     int  check (price_twd between 100 and 20000),
  photo_path    text check (photo_path ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  client_id     text check (length(client_id) <= 64),     -- 瀏覽器隨機 ID，用來算「幾個人」回報
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note   text
);
create index if not exists reports_merchant_idx on public.reports (merchant_id);
create index if not exists reports_pending_idx on public.reports (created_at) where status = 'pending';

alter table public.reports enable row level security;

-- 匿名使用者只能新增，而且只能填這些欄位（status 永遠是預設的 pending）
revoke all on public.reports from anon, authenticated;
grant insert (merchant_id, merchant_name, kind, value, price_twd, photo_path, client_id)
  on public.reports to anon, authenticated;

drop policy if exists "anyone can submit" on public.reports;
create policy "anyone can submit" on public.reports
  for insert to anon, authenticated
  with check (status = 'pending');

-- ---------------------------------------------------------------------
-- 公開彙整：只有 IG / LINE / 價格 / 歇業 / 搬家 的統計，不含個人資料
-- （view 以擁有者權限執行，刻意繞過 reports 的 RLS，只輸出彙整欄位）
-- ---------------------------------------------------------------------
create or replace view public.report_summary as
select
  merchant_id,
  kind,
  case when kind in ('ig', 'line') then lower(trim(value)) end as value,
  count(*)                                                    as reports,
  count(distinct coalesce(client_id, id::text))               as reporters,
  percentile_cont(0.5) within group (order by price_twd)      as price_median,
  max(created_at)                                             as last_at
from public.reports
where status <> 'rejected'
  and kind in ('ig', 'line', 'price', 'closed', 'moved')
group by 1, 2, 3;

-- 審核通過的作品照片
create or replace view public.approved_photos as
select merchant_id, photo_path, price_twd, created_at
from public.reports
where kind = 'photo' and status = 'approved';

grant select on public.report_summary, public.approved_photos to anon, authenticated;

-- ---------------------------------------------------------------------
-- 照片儲存：公開讀取（路徑是隨機 UUID，未審核前不會出現在任何頁面）
-- 只能上傳到 u/<隨機UUID>.<副檔名>，限 jpg/png/webp、5MB
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ugc-photos', 'ugc-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anyone can upload ugc photos" on storage.objects;
create policy "anyone can upload ugc photos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'ugc-photos' and name ~ '^u/[0-9a-f-]{36}\.(jpg|png|webp)$');
