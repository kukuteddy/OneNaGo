# 玩哪走 OneNaGo

台灣在地生活指南：依「行業 × 城市」比較店家，資料自動彙整，使用者可以補充。

**網站**：https://kukuteddy.github.io/OneNaGo/

| 文件 | 內容 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系統架構、資料模型、工作流程 |
| [docs/ADMIN.md](docs/ADMIN.md) | 審核使用者投稿、設定 GitHub Secrets |
| [brand/README.md](brand/README.md) | 品牌規範 |

## 專案結構

```
apps/web/            網站（Next.js + TypeScript，靜態輸出）
services/etl/        資料處理（Python：財政部資料 → 合併 → 定位 → Supabase）
supabase/migrations/ 資料表定義
config/              行業、城市、網站設定（網站與 ETL 共用）
brand/               品牌素材
```

## 本機開發

**網站**（Node.js 22 以上）

```bash
cd apps/web
npm install
npm run dev        # http://localhost:3000
npm run check      # eslint + 型別檢查
npm run build      # 靜態輸出到 out/
```

**資料處理**（Python 3.12 以上）

```bash
cd services/etl
python -m venv .venv && .venv/Scripts/activate   # macOS / Linux：source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env                             # 填入 SUPABASE_DB_URL
pytest && ruff check src tests && mypy src
onenago-etl build --all --dry-run                # 不寫入資料庫
onenago-etl build --all                          # 寫入 Supabase
```

## 新增城市或行業

- **城市**：`config/cities.json` 加一筆
- **行業**：`config/verticals.json` 加一筆（填財政部行業代號）

推上 GitHub 後，下一次每週更新（或在 Actions 手動執行「每週更新資料」）就會出現。
