# 玩哪走 OneNaGo：系統架構

台灣在地生活指南。依「行業 × 城市」比較店家，資料自動彙整，使用者可以補充。
品牌規範見 [brand/README.md](../brand/README.md)，審核流程見 [ADMIN.md](ADMIN.md)。

## 原則

1. **資料庫是唯一真相**：所有店家資料都在 Supabase（PostgreSQL）。網站、App、管理頁都從這裡讀。
2. **不靠人工、不花錢**：資料來源是政府開放資料加上免費服務，每週自動更新。
3. **使用者可以補充**：任何人都能送出資料，但只能新增、不能讀別人送的原始資料；網站只顯示彙整後或審核通過的結果。
4. **每次修改都有自動檢查**：lint、型別檢查、測試都通過才能上線。

## 系統圖

```
                  ┌──────── 每週排程（GitHub Actions）────────┐
財政部稅籍登記 ──▶│ services/etl（Python）                      │
OSM Nominatim  ──▶│  sources → normalize → merge → geocode      │──upsert──┐
Tavily 搜尋    ──▶│  → enrich(IG) → load                        │          │
                  └─────────────────────────────────────────────┘          ▼
                                                              ┌──────────────────────┐
     使用者（補充資訊、上傳照片）──insert only（RLS）────────▶│ Supabase PostgreSQL  │
                                                              │  merchants / reports │
     管理者（審核）──登入後 update──────────────────────────▶│  Storage: ugc-photos │
                                                              └──────────┬───────────┘
                                                                         │ 讀取（publishable key）
                                                                         ▼
                                              apps/web（Next.js 靜態輸出）──▶ GitHub Pages
                                                                                （之後 Cloudflare Pages）
```

## 專案結構

```
OneNaGo/
├─ apps/web/                 Next.js + TypeScript（App Router、靜態輸出）
│   └─ src/
│       ├─ app/              路由：/、/[vertical]/[city]/、/shop/[id]/
│       ├─ components/       ShopCard、ShopList、ShopMap、ContributeDialog …
│       └─ lib/              資料讀取、Supabase 用戶端、距離、排序
├─ services/etl/             Python 套件 onenago_etl（pytest、ruff、mypy）
│   ├─ src/onenago_etl/
│   │   ├─ sources/          財政部、人工補充 CSV
│   │   ├─ normalize/        地址、店名正規化
│   │   ├─ merge.py          同一家店合併（統編 → 門牌）
│   │   ├─ geocode.py        Nominatim 結構化查詢＋快取
│   │   ├─ enrich/           IG 搜尋比對
│   │   ├─ load.py           寫入 Supabase（upsert，未出現者標為停業）
│   │   └─ cli.py            指令進入點
│   ├─ tests/                單元測試（地址、合併、IG 比對）
│   ├─ cache/                定位與 IG 比對快取（版控，避免重複查詢）
│   └─ seeds/                人工 / 網路補充資料（可選）
├─ config/                   行業（verticals.json）、城市（cities.json）——網站和 ETL 共用
├─ supabase/migrations/      資料表定義（唯一一份，依編號套用）
├─ brand/                    品牌素材
└─ .github/workflows/        ci.yml（檢查）、etl.yml（每週更新）、deploy.yml（部署網站）
```

## 資料模型（supabase/migrations）

| 資料表 | 內容 | 誰能讀 / 寫 |
|---|---|---|
| `verticals` | 行業（nail 美甲 …） | 公開讀；ETL 寫 |
| `cities` | 城市（zhubei 竹北市 …） | 公開讀；ETL 寫 |
| `merchants` | 店家：名稱、地址、座標、IG、開業日、來源 | 公開讀（只有營業中的）；ETL 寫 |
| `merchant_verticals` | 店家 × 行業 | 公開讀；ETL 寫 |
| `reports` | 使用者補充（IG、價格、照片、歇業…） | **只能新增**；管理者審核 |
| `report_summary`（view） | 彙整後的回報 | 公開讀 |
| `approved_photos`（view） | 審核通過的照片 | 公開讀 |

店家 ID 依「統一編號 → IG → 店名＋地址」產生，**每次執行都一樣**，所以使用者回報可以一直對應到同一家店。

## 資料流程規則

- **合併**：統一編號相同 → 同一家；門牌相同但統編不同 → 不同店（同棟多間工作室）。
- **招牌名稱優先**：政府登記名稱另存一欄，不覆蓋網路或人工取得的名稱。
- **停業處理**：這次沒出現在政府資料的店標為 `is_active = false`（保留紀錄，不刪除）。
- **IG 自動比對**：店名相似、而且地點（城市 / 路名 / 電話）也相符，才採用。
- **使用者回報**：IG、LINE、歇業需要 2 人以上回報一致；照片要人工審核。

## 擴展

- **新增城市**：`config/cities.json` 加一筆。
- **新增行業**：`config/verticals.json` 加一筆（行業代號、關鍵字、顯示名稱）。

不用改程式，下次排程執行就會出現。

## 品質與部署

| 工作流程 | 觸發時機 | 內容 |
|---|---|---|
| `ci.yml` | 每次 push / PR | ETL：ruff、mypy、pytest；網站：eslint、型別檢查、建置 |
| `weekly.yml` | 每週一 03:00（台灣時間）、手動 | 套用 migration → 執行 ETL → 寫入 Supabase → 呼叫部署 |
| `deploy.yml` | 網站程式 / 設定 / 品牌變更、每週更新完成 | 建置 Next.js 靜態網站 → 部署到 Cloudflare Pages（主要）與 GitHub Pages（過渡） |

## 機密資訊

| 名稱 | 放哪裡 | 說明 |
|---|---|---|
| `SUPABASE_DB_URL` | GitHub Secrets、本機 `services/etl/.env` | ETL 寫入資料庫用，**絕不進版控** |
| `TAVILY_API_KEY` | GitHub Secrets、本機 `.env` | 選填 |
| Supabase URL、publishable key | `config/site.json` | 公開資訊，安全性靠 RLS |

## 待辦

- [x] 資料庫為唯一真相、ETL 模組化與測試、Next.js 網站、店家詳細頁、CI 檢查（v0.2）
- [ ] 投稿加 Cloudflare Turnstile（防灌水）
- [ ] 管理審核頁（Supabase Auth 登入）
- [x] 部署到 Cloudflare Pages（https://onenago.pages.dev）
- [ ] 前期用 Cloudflare Access 限定 Email 才能看；GitHub 專案改私人、停用 GitHub Pages
- [ ] 店家認領、作品牆、評論
