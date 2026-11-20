"""財政部「全國營業(稅籍)登記資料集」（政府開放資料，每日更新）。"""

from __future__ import annotations

import csv
import logging
import unicodedata
import zipfile
from collections.abc import Iterator
from pathlib import Path

from ..config import City, Vertical
from ..http import download_if_modified
from ..models import Record
from ..normalize import address as addr
from ..normalize.text import guess_kind, roc_date

log = logging.getLogger(__name__)

URL = "https://eip.fia.gov.tw/data/BGMOPEN1.zip"
# CSV 欄位：營業地址, 統一編號, 總機構統一編號, 營業人名稱, 資本額, 設立日期, 組織別名稱, 使用統一發票,
#          行業代號, 名稱, 行業代號1, 名稱1, 行業代號2, 名稱2, 行業代號3, 名稱3
_COL_ADDR, _COL_TAX, _COL_NAME, _COL_EST = 0, 1, 3, 5
_INDUSTRY_COLS = (8, 10, 12, 14)


def fetch(raw_dir: Path, *, force: bool = False) -> Path:
    """下載並解出 BGMOPEN1.csv（沒更新就用快取）。只解出指定檔名，避免 zip 路徑穿越。"""
    raw_dir.mkdir(parents=True, exist_ok=True)
    zip_path, csv_path = raw_dir / "BGMOPEN1.zip", raw_dir / "BGMOPEN1.csv"
    if force:
        zip_path.unlink(missing_ok=True)
    updated = download_if_modified(URL, zip_path, relaxed_tls=True)
    log.info("財政部資料%s", "已下載新版" if updated else "未更新，沿用快取")
    if updated or not csv_path.exists() or csv_path.stat().st_mtime < zip_path.stat().st_mtime:
        with zipfile.ZipFile(zip_path) as zf:
            member = next(n for n in zf.namelist() if n.lower().endswith("bgmopen1.csv"))
            with zf.open(member) as src, open(csv_path, "wb") as dst:
                dst.write(src.read())
    return csv_path


def _rows(csv_path: Path) -> Iterator[list[str]]:
    with open(csv_path, encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        next(reader)  # 欄位名稱
        next(reader)  # 資料日期
        yield from reader


def extract(
    csv_path: Path, verticals: list[Vertical], cities: list[City]
) -> dict[tuple[str, str], list[Record]]:
    """掃描一次（約 300MB），同時篩出所有（行業 slug, 城市 slug）組合。"""
    out: dict[tuple[str, str], list[Record]] = {(v.slug, c.slug): [] for v in verticals for c in cities}
    for row in _rows(csv_path):
        if len(row) < 10:
            continue
        address = addr.normalize(row[_COL_ADDR])
        hit_cities = [c for c in cities if addr.in_city(address, c)]
        if not hit_cities:
            continue
        name = unicodedata.normalize("NFKC", row[_COL_NAME]).strip()
        industries = [(row[i], row[i + 1]) for i in _INDUSTRY_COLS if i + 1 < len(row) and row[i]]
        codes = [code for code, _ in industries]
        for v in verticals:
            if not v.matches(name, codes):
                continue
            for c in hit_cities:
                out[(v.slug, c.slug)].append(
                    Record(
                        name=name,
                        address=address,
                        source="gov_open_data",
                        tax_id=row[_COL_TAX].strip(),
                        registered_name=name,
                        kind=guess_kind(name),
                        established=roc_date(row[_COL_EST]),
                        hints=[h.label for h in v.hints if h.matches(name)],
                    )
                )
    for (v_slug, c_slug), recs in out.items():
        log.info("  %s × %s：%d 筆", v_slug, c_slug, len(recs))
    return out
