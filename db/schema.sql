-- =====================================================================
-- 美業比較平台 資料模型 v0（PostgreSQL / Supabase）
-- 核心：店家 (merchant)、美甲師 (artist)、作品 (work) 三者並列
-- 橫向擴展：所有實體都掛 category，行業特有欄位放 attributes jsonb
-- 空檔/預約（schedules, bookings）留待店家認領階段再加
-- =====================================================================

create extension if not exists postgis;
create extension if not exists pg_trgm;   -- 店名模糊比對（entity resolution）

-- ---------------------------------------------------------------------
-- 行業分類（美甲、美睫、美髮…）
-- ---------------------------------------------------------------------
create table categories (
  id               serial primary key,
  slug             text unique not null,          -- 'nail', 'lash', 'hair'
  name             text not null,                 -- '美甲'
  parent_id        int references categories(id),
  attribute_schema jsonb not null default '{}'    -- 該行業 attributes 的 JSON Schema
);

-- 標籤：風格 / 顏色 / 技法…，依行業分組
create table tags (
  id          serial primary key,
  category_id int not null references categories(id),
  tag_group   text not null,                      -- 'style' | 'color' | 'technique' | 'length'
  name        text not null,                      -- '貓眼', '法式', '裸色'
  unique (category_id, tag_group, name)
);

-- ---------------------------------------------------------------------
-- 資料來源與認領狀態（法規：未合作店家須標示「資料來自公開資訊」）
-- ---------------------------------------------------------------------
create type data_source  as enum ('google', 'instagram', 'gov_open_data', 'manual', 'ugc', 'claimed');
create type claim_status as enum ('unclaimed', 'pending', 'claimed');

-- ---------------------------------------------------------------------
-- 店家：實體店 / 個人工作室 / 到府
-- ---------------------------------------------------------------------
create type merchant_kind as enum ('shop', 'studio', 'mobile');

create table merchants (
  id            uuid primary key default gen_random_uuid(),
  kind          merchant_kind not null default 'shop',
  name          text not null,                    -- 招牌名稱
  registered_name text,                           -- 稅籍登記名稱（常與招牌不同）
  tax_id        text unique,                      -- 統一編號（公開資訊；認領時可用來驗證）
  address       text,
  district      text,                             -- '大安區'
  city          text,                             -- '台北市'
  location      geography(Point, 4326),
  phone         text,
  claim_status  claim_status not null default 'unclaimed',
  source        data_source  not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index merchants_location_idx on merchants using gist (location);
create index merchants_name_trgm_idx on merchants using gin (name gin_trgm_ops);

create table merchant_categories (
  merchant_id uuid references merchants(id) on delete cascade,
  category_id int  references categories(id),
  primary key (merchant_id, category_id)
);

-- ---------------------------------------------------------------------
-- 美甲師：可獨立接案，也可在多家店之間流動
-- ---------------------------------------------------------------------
create table artists (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,                    -- 只存公開藝名，不存本名（個資法）
  bio           text,
  claim_status  claim_status not null default 'unclaimed',
  source        data_source  not null,
  created_at    timestamptz not null default now()
);

create table merchant_artists (
  merchant_id uuid references merchants(id) on delete cascade,
  artist_id   uuid references artists(id)   on delete cascade,
  started_on  date,
  ended_on    date,                             -- null = 目前在職
  primary key (merchant_id, artist_id)
);

-- ---------------------------------------------------------------------
-- 外部連結：Google place_id、IG 帳號、LINE、預約系統…
-- Google 條款：只有 place_id 可長期保存，其他欄位需定期重抓 → fetched_at
-- ---------------------------------------------------------------------
create type external_kind as enum ('google_place', 'instagram', 'line', 'facebook', 'booking', 'website');

create table external_refs (
  id           bigserial primary key,
  merchant_id  uuid references merchants(id) on delete cascade,
  artist_id    uuid references artists(id)   on delete cascade,
  kind         external_kind not null,
  external_id  text,                            -- place_id / IG username
  url          text,
  meta         jsonb not null default '{}',     -- 例：{rating, review_count} 快取
  fetched_at   timestamptz,
  check (merchant_id is not null or artist_id is not null),
  unique (kind, external_id)
);

-- ---------------------------------------------------------------------
-- 作品：平台核心。可來自 IG 嵌入、客人上傳 (UGC)、店家上傳
-- ---------------------------------------------------------------------
create type work_status as enum ('pending', 'published', 'rejected');

create table works (
  id            uuid primary key default gen_random_uuid(),
  category_id   int  not null references categories(id),
  merchant_id   uuid references merchants(id) on delete set null,
  artist_id     uuid references artists(id)   on delete set null,
  source        data_source not null,
  -- IG 來源只存 permalink 以嵌入方式顯示（著作權）；UGC/店家上傳才存自有圖片
  permalink     text,
  image_path    text,                           -- Supabase Storage 路徑
  price_twd     int,                            -- 客人回報或店家標示的價格
  attributes    jsonb not null default '{}',    -- 美甲：{"fingers":10,"extension":true,"removal":false}
  uploaded_by   uuid,                           -- users.id（UGC）
  status        work_status not null default 'pending',
  done_on       date,
  created_at    timestamptz not null default now(),
  check (permalink is not null or image_path is not null),
  check (merchant_id is not null or artist_id is not null)
);
create index works_merchant_idx on works (merchant_id);
create index works_artist_idx   on works (artist_id);
create index works_attr_idx     on works using gin (attributes);

create table work_tags (
  work_id    uuid references works(id) on delete cascade,
  tag_id     int  references tags(id),
  confidence real,                              -- AI 標註信心值；人工標 = 1
  tagged_by  text not null default 'ai',        -- 'ai' | 'user' | 'merchant'
  primary key (work_id, tag_id)
);

-- ---------------------------------------------------------------------
-- 服務項目與價格
-- ---------------------------------------------------------------------
create table services (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references merchants(id) on delete cascade,
  category_id   int  not null references categories(id),
  name          text not null,                  -- '單色凝膠（手）'
  price_min     int,
  price_max     int,
  duration_min  int,                            -- 之後算空檔會用到
  attributes    jsonb not null default '{}',
  source        data_source not null
);

-- ---------------------------------------------------------------------
-- 使用者與認領
-- ---------------------------------------------------------------------
create table users (
  id            uuid primary key default gen_random_uuid(),
  line_user_id  text unique,
  display_name  text,
  created_at    timestamptz not null default now()
);

alter table works add constraint works_uploaded_by_fk foreign key (uploaded_by) references users(id);

create table claims (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id),
  merchant_id  uuid references merchants(id),
  artist_id    uuid references artists(id),
  evidence     text,                            -- 例：IG 私訊驗證碼
  status       claim_status not null default 'pending',
  created_at   timestamptz not null default now(),
  check (merchant_id is not null or artist_id is not null)
);

-- ---------------------------------------------------------------------
-- 投稿（讓資料自己長大）：免登入也能送，人工/AI 審核後轉成正式資料
--   merchant_signup  店家自助刊登：{"name","ig","address","price_from"}
--   work_post        客人投稿作品：{"permalink","merchant_name"|"merchant_id","price_twd","done_on","tags":[]}
--   correction       資料更正：    {"merchant_id","field","value"}
-- ---------------------------------------------------------------------
create type submission_kind as enum ('merchant_signup', 'work_post', 'correction');

create table submissions (
  id            uuid primary key default gen_random_uuid(),
  kind          submission_kind not null,
  payload       jsonb not null,
  submitted_by  uuid references users(id),        -- 可為 null（未登入）
  contact       text,                             -- 選填：店家 IG / LINE 方便回覆
  status        work_status not null default 'pending',
  review_note   text,
  -- 審核通過後指向產生的正式資料
  merchant_id   uuid references merchants(id),
  work_id       uuid references works(id),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);
create index submissions_pending_idx on submissions (created_at) where status = 'pending';

-- ---------------------------------------------------------------------
-- 種子資料
-- ---------------------------------------------------------------------
insert into categories (slug, name) values ('nail', '美甲');

insert into tags (category_id, tag_group, name)
select c.id, t.g, t.n
from categories c,
     (values ('style','純色'), ('style','貓眼'), ('style','法式'), ('style','漸層'),
             ('style','手繪'), ('style','鏡面'), ('style','暈染'), ('style','日系'),
             ('style','韓系'), ('style','跳色'),
             ('technique','凝膠'), ('technique','延甲'), ('technique','甲片'),
             ('technique','建構'), ('technique','卸甲'),
             ('color','裸色'), ('color','紅'), ('color','粉'), ('color','黑'),
             ('color','白'), ('color','金屬'))
     as t(g, n)
where c.slug = 'nail';
