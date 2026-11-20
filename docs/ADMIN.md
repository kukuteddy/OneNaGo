# 玩哪走 OneNaGo：管理手冊

## 一、管理審核頁

網址：**`/admin/`**（例：https://kukuteddy.github.io/OneNaGo/admin/ ）。搜尋引擎不會收錄這個頁面。

### 第一次設定管理者帳號（約 2 分鐘）

1. 打開 Supabase：https://supabase.com/dashboard/project/kkgedobyxbufkywuxkzy/auth/users
2. 按 **Add user → Create new user**，填 Email 和密碼，勾選 **Auto Confirm User**，再按 **Create user**。
3. 把這個 Email 告訴 Claude，或自己在 `services/etl` 執行：
   ```bash
   onenago-etl add-admin 你的Email
   ```
4. 到 `/admin/` 用剛才的 Email 和密碼登入。

沒有加進管理者名單的帳號，登入後也看不到任何資料（由資料庫權限把關）。

### 審核

審核頁分成三類，每一類都會顯示待審數量：

| 類型 | 內容 | 通過後 |
|---|---|---|
| 回報與照片 | 作品照片、IG、LINE、價格、歇業、搬家、資料有誤、新增店家 | 照片出現在店家頁和作品牆 |
| 評論 | 星等＋心得 | 公開在店家頁，計入平均評分 |
| 店家認領 | 稱呼、身分、聯絡方式、證明、Logo（選填） | 店家頁顯示「✓ 店家已認領」，排序更前面；有 Logo 的話成為店家大頭貼 |

- 認領請先用對方留的聯絡方式確認身分（例如請對方用店家 IG 私訊你），再按通過。
- 按錯了可以「改回待審」。退回的資料不會公開，也不會計入「2 人以上回報」的計算。
- Logo 請確認是店家自己的圖片（不是盜用別人的作品或品牌）。
- 「店家已認領」標章和 Logo 會在下一次網站部署時出現（每週自動，或手動執行「部署網站」）。

### 哪些不用審核、會自動顯示

| 類型 | 何時顯示 |
|---|---|
| IG 帳號、LINE | 2 個人以上回報相同內容 |
| 價格 | 有人回報就顯示（取中位數，標示「客人回報」） |
| 已歇業、已搬家 | 2 個人以上回報，自動加上警示標籤 |

有人亂填的話，到審核頁把那筆改成「退回」即可。

## 二、GitHub Secrets（自動更新與部署需要）

到 https://github.com/kukuteddy/OneNaGo/settings/secrets/actions 按 **New repository secret**。

| Secret | 用途 | 從哪裡拿 |
|---|---|---|
| `SUPABASE_DB_URL` | 每週更新寫入資料庫（必要） | 本機 `services/etl/.env` 裡 `SUPABASE_DB_URL=` 後面的整串 |
| `CLOUDFLARE_ACCOUNT_ID` | 部署到 Cloudflare | Cloudflare 後台 → Workers & Pages，右側的 Account ID |
| `CLOUDFLARE_API_TOKEN` | 部署到 Cloudflare | 右上頭像 → My Profile → API Tokens → Create Custom Token，權限 `Account / Cloudflare Pages / Edit` |
| `TAVILY_API_KEY` | 自動找店家 IG（選填） | https://tavily.com 免費帳號 |

設好之後可以到 **Actions** 分頁手動執行「每週更新資料」或「部署網站」確認。沒設定 Cloudflare 時會自動略過，只部署到 GitHub Pages。

## 三、啟用防灌水（Cloudflare Turnstile）

程式已經寫好，預設關閉。開啟後，每次投稿都要先通過人機驗證（多數人不用點任何東西）。

1. Cloudflare 後台 → **Turnstile** → **Add widget**：網域填 `onenago.pages.dev`、`kukuteddy.github.io`、`localhost`，模式選 **Managed**，取得 **Site Key** 和 **Secret Key**。
2. 把 **Site Key** 填進 `config/site.json` 的 `turnstile.siteKey`（公開資訊）。
3. 部署 Edge Function（需要 Supabase CLI 與 Access Token）：
   ```bash
   supabase functions deploy submit --project-ref kkgedobyxbufkywuxkzy
   supabase secrets set --project-ref kkgedobyxbufkywuxkzy \
     TURNSTILE_SECRET_KEY=<Secret Key> \
     ALLOWED_ORIGINS=https://onenago.pages.dev,https://kukuteddy.github.io
   ```
4. 確認網站投稿正常後，執行 `supabase/optional/enable_turnstile.sql`，關閉「不經驗證直接寫入」。

也可以把 Turnstile 的兩組 Key 和 Supabase Access Token 存成專案資料夾裡的文字檔交給 Claude 設定（這些檔案已設成不會上傳 GitHub）。

## 四、資料庫結構的變更

資料表定義在 `supabase/migrations/`，依檔名順序套用，已套用的會記錄在 `schema_migrations` 資料表。新增檔案後執行 `onenago-etl migrate`（每週更新也會自動執行）。

資料庫密碼存在本機的 `supabase.txt` 和 `services/etl/.env`，這兩個檔案都已經列入 `.gitignore`，**不會上傳到 GitHub**。
