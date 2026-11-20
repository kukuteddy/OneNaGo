# 美甲店資料管線（全自動、零付費 API）

## 一個指令

```
python pipeline.py build --all              # config/cities.json 裡所有城市
python pipeline.py build --city 竹北市       # 或指定城市
```

這個指令會自動完成以下步驟：

1. 下載財政部稅籍登記資料
2. 篩出美甲店
3. 合併補充資料
4. 定位地址
5. 產生報告、SQL 和網站

做完後打開 `data/public/index.html` 就能看到結果（首頁列出所有城市）。

上線後由 GitHub Actions 每週一自動執行並部署到 GitHub Pages，見 `.github/workflows/build.yml`。

- 新增城市：編輯 `config/cities.json`。
- 架構說明：見 [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)。

## 可選的補充

- `seeds/<行業>_<城市>_*.csv`（例：`nail_竹北市_web.csv`）：補上招牌名稱、IG、LINE（格式見 `seeds/merchants_template.csv`）。這一步是可選的，沒有也能跑。
- `.env` 填入 IG 權杖：build 時會自動抓作品。

## 個別步驟（除錯用）

```
python pipeline.py mof <BGMOPEN1.csv> --vertical nail --city 竹北市
python pipeline.py import <csv> --vertical nail --area 竹北市
python pipeline.py geocode
python pipeline.py report
python pipeline.py sql
python pipeline.py site --vertical nail --city 竹北市
```
