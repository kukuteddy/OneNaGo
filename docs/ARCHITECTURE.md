# 架構與資料流程

目標：**不靠人工、不花錢**，自動產生並更新各城市的美業店家名單；美甲先行，之後橫向擴展到美睫、美髮等行業。

## 一、資料流程（現在：prototype/pipeline.py）

```
                 ┌───────────── 來源（全部免費） ─────────────┐
                 │ ① 財政部稅籍登記（每日更新，主要來源）      │
                 │ ② seeds/<城市>_*.csv（網路/人工補充，可選） │
                 │ ③ IG Business Discovery（有權杖才跑，可選）│
                 └───────────────┬────────────────────────────┘
                                 ▼
 python pipeline.py build --city 竹北市
   1 fetch     下載 BGMOPEN1.zip（If-Modified-Since，沒更新就用快取）
   2 extract   篩出 行業代號 962211「美甲美睫服務」或店名含 美甲/指甲/nail
   3 merge     統一編號 → 門牌比對（國字/數字、里鄰、樓層正規化）→ 同店合併
               同門牌但統編不同 = 不同店（同棟多間工作室）
   4 geocode   OSM Nominatim 結構化查詢，逐級降級 門牌 → 巷弄 → 道路 → 行政區
               結果寫入 cache/geocode_cache.json，下次只查新地址
   5 export    data/seed.sql（可直接匯入 db/schema.sql 建的 PostgreSQL）
   6 site      data/site/index.html（靜態網站，資料內嵌）
```

| 目錄 | 內容 | 版控 |
|---|---|---|
| `config/cities.json` | 城市清單與地標（新增城市只改這裡） | ✓ |
| `config/verticals.json` | 行業：行業代號、關鍵字、顯示名稱（新增行業只改這裡） | ✓ |
| `seeds/` | 人工 / 網路補充資料（可選） | ✓ |
| `templates/` | 網站樣板 | ✓ |
| `cache/geocode_cache.json` | 定位快取（越用越快） | ✓ |
| `cache/mof/` | 政府原始檔（300MB） | ✗ |
| `data/` | 每次 build 的產出，可整個刪掉重建 | ✗ |

**新增一個城市**：在 `config/cities.json` 加一筆（城市名、縣市、網址代稱 slug、幾個地標查詢字）。

**新增一個行業**（橫向擴展）：在 `config/verticals.json` 加一筆，填行業代號（例：美髮 962111、其他美容美體 962299）、店名關鍵字、顯示名稱。資料庫的分類會自動建立，資料表本身不用改。

改完之後下一次 build（每週自動）就會出現，不需要任何人工整理。

網址結構是 `/<行業>/<城市>/`，例如 `/nail/zhubei/`；首頁 `/` 會依行業列出所有城市。政府資料只掃描一次，就能同時篩出所有「行業 × 城市」的組合。

## 二、資料品質規則

- **只放公開資訊**，頁面標示「資料來自公開資訊，非合作店家」。
- **招牌名稱優先**：政府登記名稱常與招牌不同（例：「竹揚企業社」），網路或店家提供的名稱會覆蓋登記名稱，登記名稱另存一欄。
- **多來源核對**：同一家店被兩個以上獨立來源指到，標「多來源核對」。
- **疑似只做美睫**：店名有「睫」沒有「甲」的，標示並降低排序。

## 三、自動更新（下一步，0 元）

```
GitHub Actions（每週排程，免費）
  └─ python pipeline.py build --city <每個城市>
       ├─ commit cache/geocode_cache.json（保留定位快取）
       ├─ 部署 data/site → Cloudflare Pages / GitHub Pages（免費）
       └─ 匯入 data/seed.sql → Supabase（免費方案）
```

- 財政部資料每天更新。新開的店會自動出現；歇業註銷的店，下次 build 就會消失。
- Nominatim 規定每秒最多 1 次查詢。全台美甲店約數千家，第一次 build 約 1–2 小時，之後只查新增的店，幾分鐘內完成。

## 四、正式產品架構（資料長大之後）

```
 [排程 build] ──寫入──▶ Supabase (PostgreSQL + PostGIS)
                              ▲            │
     店家自助刊登 / 客人投稿 ──┘            ▼
       （submissions 表，審核後轉正式）   Next.js PWA（Vercel 免費）
                                           ├─ 列表 / 地圖 / 作品牆
                                           └─ LINE 登入、LINE 通知
```

自動資料（政府資料、IG）和使用者貢獻（刊登、投稿、更正）**寫進同一套資料表**，用 `source` 和 `sources` 欄位區分來源。這樣不論哪種來源，前端的顯示方式都一樣。
