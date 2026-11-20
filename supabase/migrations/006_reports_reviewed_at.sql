-- 修正：003 為 reports 加了「審核時間自動記錄」觸發器，但 reports 沒有 reviewed_at 欄位，
-- 導致審核回報 / 照片時更新失敗
alter table public.reports add column if not exists reviewed_at timestamptz;
