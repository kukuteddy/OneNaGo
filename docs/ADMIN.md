# 玩哪走 OneNaGo：審核使用者補充的資訊

使用者在網站上按「補充資訊」或「＋ 新增店家」送出的資料，都存在 Supabase 的 `reports` 資料表。

## 哪些會自動顯示、哪些要你審核

| 類型 | 何時顯示 |
|---|---|
| IG 帳號、LINE | **兩個人以上**回報相同內容，自動顯示 |
| 價格 | 有人回報就顯示（取中位數，標示「客人回報」） |
| 已歇業、已搬家 | 兩個人以上回報，自動加上警示標籤 |
| **作品照片** | **你審核通過**才顯示 |
| 其他資料有誤、新增店家 | 只存起來給你看，不會自動改網站 |

## 怎麼審核（約 1 分鐘）

1. 打開 Supabase：https://supabase.com/dashboard/project/kkgedobyxbufkywuxkzy/editor
2. 左邊選 **reports** 資料表。
3. 上方按 **Filter**，加條件 `status` = `pending`，就只會看到待審核的資料。
4. 看照片：把 `photo_path` 的值接在這個網址後面，用瀏覽器打開：
   `https://kkgedobyxbufkywuxkzy.supabase.co/storage/v1/object/public/ugc-photos/u/`
5. 把 `status` 改成：
   - `approved`：通過，照片馬上出現在網站上
   - `rejected`：退回，不顯示，也不會計入自動顯示的人數
6. 可以在 `review_note` 寫原因，給自己日後參考。

被退回的資料**不會**計入「兩人以上回報」的計算，所以如果有人亂填 IG，把它改成 `rejected` 就好。

## 設定 GitHub Secrets（每週自動更新需要）

每週更新會把資料寫進 Supabase，所以 GitHub 需要資料庫連線字串。這個字串含有密碼，**只放在 GitHub Secrets**，不會出現在程式碼裡。

1. 打開本機的 `services/etl/.env`，複製 `SUPABASE_DB_URL=` **後面**的整串文字。
2. 打開 https://github.com/kukuteddy/OneNaGo/settings/secrets/actions
3. 按 **New repository secret**：
   - Name：`SUPABASE_DB_URL`
   - Secret：貼上剛才複製的文字
4. 按 **Add secret**。

選填：申請 [Tavily](https://tavily.com) 免費帳號後，用同樣方式新增 `TAVILY_API_KEY`，每週更新就會自動幫店家找 IG。

設好之後，可以到 **Actions → 每週更新資料 → Run workflow** 手動跑一次確認。

## 資料庫結構的變更

資料表定義在 `supabase/migrations/`，依檔名順序套用，已套用的會記錄在 `schema_migrations` 資料表。新增檔案後執行 `onenago-etl migrate`（每週更新也會自動執行）。

資料庫密碼存在本機的 `supabase.txt` 和 `services/etl/.env`，這兩個檔案都已經列入 `.gitignore`，**不會上傳到 GitHub**。
