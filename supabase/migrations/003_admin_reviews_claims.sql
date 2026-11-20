-- =====================================================================
-- 玩哪走 OneNaGo：管理者審核、評論、店家認領
-- 原則同 reports：任何人只能「新增」；只有管理者能讀原始資料、改審核狀態；
-- 網站只讀審核通過的內容（views）。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 管理者：在 Supabase Auth 建立帳號後，把 user_id 加進這張表
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
drop policy if exists "read self" on public.admins;
create policy "read self" on public.admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 審核時間自動記錄
create or replace function public.touch_reviewed_at() returns trigger
  language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.reviewed_at := now();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- reports（001）：開放管理者讀取與審核
-- ---------------------------------------------------------------------
grant select on public.reports to authenticated;
grant update (status, review_note) on public.reports to authenticated;
drop policy if exists "admin read" on public.reports;
create policy "admin read" on public.reports for select to authenticated using (public.is_admin());
drop policy if exists "admin review" on public.reports;
create policy "admin review" on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop trigger if exists reports_reviewed_at on public.reports;
create trigger reports_reviewed_at before update on public.reports
  for each row execute function public.touch_reviewed_at();

-- ---------------------------------------------------------------------
-- 評論：先審核再公開（前期防洗評論；之後有會員登入再改成即時）
-- ---------------------------------------------------------------------
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  merchant_id text not null check (length(merchant_id) between 1 and 64),
  rating      int  not null check (rating between 1 and 5),
  body        text not null default '' check (length(body) <= 1000),
  nickname    text check (length(nickname) <= 30),
  visited_on  date,
  client_id   text check (length(client_id) <= 64),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_at timestamptz
);
create index if not exists reviews_merchant_idx on public.reviews (merchant_id) where status = 'approved';
alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant insert (merchant_id, rating, body, nickname, visited_on, client_id) on public.reviews to anon, authenticated;
grant select on public.reviews to authenticated;
grant update (status, review_note) on public.reviews to authenticated;
drop policy if exists "anyone can submit" on public.reviews;
create policy "anyone can submit" on public.reviews for insert to anon, authenticated with check (status = 'pending');
drop policy if exists "admin read" on public.reviews;
create policy "admin read" on public.reviews for select to authenticated using (public.is_admin());
drop policy if exists "admin review" on public.reviews;
create policy "admin review" on public.reviews for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop trigger if exists reviews_reviewed_at on public.reviews;
create trigger reviews_reviewed_at before update on public.reviews
  for each row execute function public.touch_reviewed_at();

create or replace view public.approved_reviews as
select id, merchant_id, rating, body, nickname, visited_on, created_at
from public.reviews where status = 'approved';

create or replace view public.review_stats as
select merchant_id, count(*)::int as reviews, round(avg(rating)::numeric, 1)::float as rating
from public.reviews where status = 'approved'
group by merchant_id;

grant select on public.approved_reviews, public.review_stats to anon, authenticated;

-- ---------------------------------------------------------------------
-- 店家認領：店家送出申請 → 管理者聯繫驗證 → 通過後店家頁顯示「店家已認領」
-- 聯絡方式只有管理者看得到
-- ---------------------------------------------------------------------
alter table public.merchants add column if not exists claimed boolean not null default false;
grant select (claimed) on public.merchants to anon, authenticated;

create table if not exists public.claims (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  merchant_id   text not null check (length(merchant_id) between 1 and 64),
  merchant_name text check (length(merchant_name) <= 100),
  owner_name    text not null check (length(owner_name) between 1 and 50),
  role          text check (role in ('owner', 'manager', 'artist')),
  contact       text not null check (length(contact) between 3 and 200),  -- LINE / 電話 / Email
  proof         text check (length(proof) <= 500),                         -- 例：IG 帳號、統編
  client_id     text check (length(client_id) <= 64),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note   text,
  reviewed_at   timestamptz
);
alter table public.claims enable row level security;
revoke all on public.claims from anon, authenticated;
grant insert (merchant_id, merchant_name, owner_name, role, contact, proof, client_id) on public.claims to anon, authenticated;
grant select on public.claims to authenticated;
grant update (status, review_note) on public.claims to authenticated;
drop policy if exists "anyone can submit" on public.claims;
create policy "anyone can submit" on public.claims for insert to anon, authenticated with check (status = 'pending');
drop policy if exists "admin read" on public.claims;
create policy "admin read" on public.claims for select to authenticated using (public.is_admin());
drop policy if exists "admin review" on public.claims;
create policy "admin review" on public.claims for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop trigger if exists claims_reviewed_at on public.claims;
create trigger claims_reviewed_at before update on public.claims
  for each row execute function public.touch_reviewed_at();

-- 認領通過 → 店家標為已認領（以擁有者權限執行，管理者不需要 merchants 的寫入權）
create or replace function public.apply_claim() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.merchants set claimed = true where id::text = new.merchant_id;
  elsif old.status = 'approved' and new.status <> 'approved' then
    update public.merchants set claimed = false where id::text = new.merchant_id
      and not exists (select 1 from public.claims c where c.merchant_id = new.merchant_id
                      and c.status = 'approved' and c.id <> new.id);
  end if;
  return new;
end $$;
drop trigger if exists claims_apply on public.claims;
create trigger claims_apply after update on public.claims
  for each row execute function public.apply_claim();

-- ---------------------------------------------------------------------
-- 作品牆：審核通過的照片加上店家名稱（只輸出公開欄位）
-- ---------------------------------------------------------------------
create or replace view public.photo_wall as
select r.photo_path, r.price_twd, r.created_at, m.short_id, m.name, m.city_slug, m.road
from public.reports r
join public.merchants m on m.id::text = r.merchant_id and m.is_active
where r.kind = 'photo' and r.status = 'approved';
grant select on public.photo_wall to anon, authenticated;
