"""人工 / 網路補充資料：seeds/<行業>_<城市>_*.csv（可選）。"""

from __future__ import annotations

import csv
import logging
from pathlib import Path

from ..models import Record
from ..normalize import address as addr
from ..normalize.text import ig_handle

log = logging.getLogger(__name__)

FIELDS = ("name", "kind", "ig", "address", "phone", "line", "notes")


def load(seeds_dir: Path, vertical: str, city: str) -> list[Record]:
    records: list[Record] = []
    for path in sorted(seeds_dir.glob(f"{vertical}_{city}_*.csv")):
        with open(path, encoding="utf-8-sig", newline="") as f:
            for lineno, row in enumerate(csv.DictReader(f), start=2):
                name = (row.get("name") or "").strip()
                if not name or name.startswith("#"):
                    continue
                raw_ig = (row.get("ig") or "").strip()
                ig = ig_handle(raw_ig)
                if raw_ig and not ig:
                    log.warning("%s 第 %d 行 IG 無法辨識：%s", path.name, lineno, raw_ig)
                kind = (row.get("kind") or "").strip()
                records.append(
                    Record(
                        name=name,
                        address=addr.normalize(row.get("address") or ""),
                        source="manual",
                        kind=kind if kind in ("shop", "studio", "mobile") else "shop",
                        phone=(row.get("phone") or "").strip(),
                        ig=ig,
                        line=(row.get("line") or "").strip(),
                    )
                )
        log.info("  補充資料 %s", path.name)
    return records
