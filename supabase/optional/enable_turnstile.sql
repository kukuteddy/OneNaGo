-- =====================================================================
-- 啟用防灌水後才執行（不在 migrations/ 裡，不會自動套用）
-- 關閉匿名直接寫入：所有投稿都必須經過 Edge Function `submit`（Turnstile 驗證）
-- 還原：重新執行 001、003 裡對應的 grant 與 policy
-- =====================================================================

revoke insert on public.reports, public.reviews, public.claims from anon, authenticated;
drop policy if exists "anyone can submit" on public.reports;
drop policy if exists "anyone can submit" on public.reviews;
drop policy if exists "anyone can submit" on public.claims;
drop policy if exists "anyone can upload ugc photos" on storage.objects;
