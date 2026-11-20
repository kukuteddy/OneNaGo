-- =====================================================================
-- 玩哪走 OneNaGo：作品照片署名
-- 上傳作品時可以留暱稱（選填），審核通過後顯示在店家頁和作品牆，鼓勵分享
-- =====================================================================

alter table public.reports add column if not exists nickname text check (length(nickname) <= 30);
grant insert (nickname) on public.reports to anon, authenticated;

-- view 新增欄位只能加在最後
create or replace view public.approved_photos as
select merchant_id, photo_path, price_twd, created_at, nickname
from public.reports
where kind = 'photo' and status = 'approved';

create or replace view public.photo_wall as
select r.photo_path, r.price_twd, r.created_at, m.short_id, m.name, m.city_slug, m.road, r.nickname
from public.reports r
join public.merchants m on m.id::text = r.merchant_id and m.is_active
where r.kind = 'photo' and r.status = 'approved';
