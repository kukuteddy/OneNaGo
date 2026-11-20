"""地址轉座標：OpenStreetMap Nominatim（免費，每秒最多 1 次）＋ 永久快取。

台灣地址用自由文字查幾乎都失敗；結構化查詢 street="1號 羅斯福路四段" 才能定位到門牌。
查不到就逐級降級：門牌 → 巷弄 → 道路 → 行政區。
"""

from __future__ import annotations

import json
import logging
import time
import urllib.parse
from pathlib import Path
from typing import Any

from .http import request_json
from .models import Merchant
from .normalize import address as addr

log = logging.getLogger(__name__)

NOMINATIM = "https://nominatim.openstreetmap.org/search"
_MIN_INTERVAL = 1.1  # 使用政策：每秒最多 1 次


class Geocoder:
    def __init__(self, cache_path: Path) -> None:
        self.cache_path = cache_path
        self.cache: dict[str, Any] = (
            json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
        )
        self.network_calls = 0
        self._last = 0.0

    def save(self) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps(self.cache, ensure_ascii=False, indent=1), encoding="utf-8")

    def _query(self, params: dict[str, str]) -> dict[str, Any] | None:
        key = json.dumps(params, ensure_ascii=False, sort_keys=True)
        if key in self.cache:
            hit: dict[str, Any] | None = self.cache[key]
            return hit
        wait = _MIN_INTERVAL - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        url = (
            NOMINATIM
            + "?"
            + urllib.parse.urlencode(
                {**params, "format": "jsonv2", "limit": 1, "countrycodes": "tw", "accept-language": "zh-TW"}
            )
        )
        try:
            res = request_json(url)
        except Exception as e:  # 網路錯誤不寫入快取，下次再試
            log.warning("Nominatim 查詢失敗：%s", e)
            return None
        finally:
            self._last = time.monotonic()
            self.network_calls += 1
        result = res[0] if res else None
        self.cache[key] = result
        return result

    def locate(self, m: Merchant) -> bool:
        """幫店家補上座標；成功回傳 True。"""
        p = addr.parse(m.address)
        county, district = addr.split_admin(m.address)
        candidates: list[tuple[dict[str, str], str]] = []
        if p:
            if p.number:
                candidates.append(({"street": f"{p.number} {p.street}", "city": county}, "address"))
            if p.lane:
                candidates.append(({"q": f"{county}{district}{p.street}"}, "lane"))
            candidates.append(({"q": f"{county}{district}{p.road}"}, "road"))
        if county and district:
            candidates.append(({"q": county + district}, "district"))
        for params, precision in candidates:
            r = self._query(params)
            if r:
                m.lat, m.lng, m.geo_precision = float(r["lat"]), float(r["lon"]), precision
                return True
        return False

    def landmark(self, query: str) -> tuple[float, float] | None:
        r = self._query({"q": query})
        return (float(r["lat"]), float(r["lon"])) if r else None
