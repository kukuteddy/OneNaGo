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

## 資料庫結構的變更

資料表定義在 `supabase/migrations/`，變更時由 Claude 透過資料庫連線套用。資料庫密碼存在本機的 `supabase.txt`，這個檔案已經列入 `.gitignore`，**不會上傳到 GitHub**。
