-- =====================================================================
-- 玩哪走 OneNaGo：店家認領時上傳 Logo / 大頭貼
-- 認領通過 → merchants.logo_path 設為該申請的 Logo，網站大頭貼優先使用
-- 圖片由店家本人提供，授權來源清楚（不抓 IG / Google 圖片）
-- =====================================================================

alter table public.claims add column if not exists logo_path text
  check (logo_path ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$');
grant insert (logo_path) on public.claims to anon, authenticated;

alter table public.merchants add column if not exists logo_path text;
grant select (logo_path) on public.merchants to anon, authenticated;

-- 依「目前所有通過的認領」重新計算已認領與 Logo（取最近審核通過、有 Logo 的那筆）
create or replace function public.apply_claim() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    update public.merchants m set
      claimed = exists (
        select 1 from public.claims c where c.merchant_id = new.merchant_id and c.status = 'approved'),
      logo_path = (
        select c.logo_path from public.claims c
        where c.merchant_id = new.merchant_id and c.status = 'approved' and c.logo_path is not null
        order by c.reviewed_at desc nulls last, c.created_at desc
        limit 1)
    where m.id::text = new.merchant_id;
  end if;
  return new;
end $$;
