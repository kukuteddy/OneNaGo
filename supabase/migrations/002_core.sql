-- =====================================================================
-- 玩哪走 OneNaGo：核心資料（行業、城市、店家）
-- 寫入：只有 ETL（以資料庫連線、postgres 角色）
-- 讀取：任何人都可以讀「營業中」的店家
-- =====================================================================

create table if not exists public.verticals (
  slug        text primary key check (slug ~ '^[a-z][a-z0-9-]*$'),
  name        text not null,
  source_note text,
  sort        int  not null default 0
);

create table if not exists public.cities (
  slug      text primary key check (slug ~ '^[a-z][a-z0-9-]*$'),
  name      text not null,
  county    text not null,
  landmarks jsonb not null default '[]',   -- [{name, lat, lng}]，ETL 定位後寫入
  sort      int  not null default 0
);

create table if not exists public.merchants (
  id              uuid primary key,                       -- 決定性 ID（統編 → IG → 店名＋地址）
  short_id        text not null unique check (short_id ~ '^[0-9a-f]{8}$'),  -- 網址用：/shop/<short_id>/
  city_slug       text not null references public.cities (slug),
  name            text not null,                          -- 招牌名稱
  registered_name text,                                   -- 稅籍登記名稱
  tax_id          text,
  kind            text not null default 'shop' check (kind in ('shop', 'studio', 'mobile')),
  address         text,
  road            text,                                   -- 顯示用：路名＋巷弄
  lat             double precision,
  lng             double precision,
  geo_precision   text check (geo_precision in ('address', 'lane', 'road', 'district')),
  phone           text,
  ig              text,
  ig_source       text check (ig_source in ('manual', 'search', 'ugc')),
  line            text,
  established     date,
  sources         text[] not null default '{}',           -- gov_open_data / manual / …（2 個以上 = 多來源核對）
  hints           text[] not null default '{}',           -- 例：可能只做美睫
  is_active       boolean not null default true,          -- 這次 ETL 沒出現 → false（保留紀錄）
  first_seen      date not null default current_date,
  last_seen       date not null default current_date,
  updated_at      timestamptz not null default now()
);
create index if not exists merchants_city_idx on public.merchants (city_slug) where is_active;

create table if not exists public.merchant_verticals (
  merchant_id   uuid references public.merchants (id) on delete cascade,
  vertical_slug text references public.verticals (slug),
  primary key (merchant_id, vertical_slug)
);
create index if not exists merchant_verticals_v_idx on public.merchant_verticals (vertical_slug);

-- ---------------------------------------------------------------------
-- 權限：公開唯讀
-- ---------------------------------------------------------------------
alter table public.verticals          enable row level security;
alter table public.cities             enable row level security;
alter table public.merchants          enable row level security;
alter table public.merchant_verticals enable row level security;

revoke all on public.verticals, public.cities, public.merchants, public.merchant_verticals from anon, authenticated;
grant select on public.verticals, public.cities, public.merchant_verticals to anon, authenticated;
-- 欄位層級授權：不含 tax_id（網站用不到的公開資訊，不對外提供）
grant select (id, short_id, city_slug, name, registered_name, kind, address, road, lat, lng, geo_precision,
              phone, ig, ig_source, line, established, sources, hints, is_active, first_seen, last_seen, updated_at)
  on public.merchants to anon, authenticated;

drop policy if exists "public read" on public.verticals;
create policy "public read" on public.verticals for select to anon, authenticated using (true);

drop policy if exists "public read" on public.cities;
create policy "public read" on public.cities for select to anon, authenticated using (true);

drop policy if exists "public read active" on public.merchants;
create policy "public read active" on public.merchants for select to anon, authenticated using (is_active);

drop policy if exists "public read" on public.merchant_verticals;
create policy "public read" on public.merchant_verticals for select to anon, authenticated using (true);
