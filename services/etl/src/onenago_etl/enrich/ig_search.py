"""用搜尋 API（Tavily，免費每月 1,000 次）找店家的 IG，比對確認後才採用。

採用條件：店名相似度 ≥ 0.5，而且地點也相符（城市 / 路名 / 電話）。
結果存在 cache/ig_discovery.json（版控）：找到的永久沿用；沒找到的 90 天後再查。
"""

from __future__ import annotations

import json
import logging
import re
import time
import urllib.error
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from ..http import request_json
from ..models import Merchant
from ..normalize import address as addr
from ..normalize.text import IG_RESERVED, name_similarity

log = logging.getLogger(__name__)

TAVILY_URL = "https://api.tavily.com/search"
RETRY_AFTER_DAYS = 90
MIN_SCORE = 0.5
_URL_HANDLE = re.compile(r"instagram\.com/([A-Za-z0-9_.]{1,30})/?(?:[?#]|$)")
_TITLE_HANDLE = re.compile(r"\(@([A-Za-z0-9_.]{1,30})\)")


@dataclass(frozen=True)
class Candidate:
    handle: str
    title: str
    text: str


def candidates(results: list[dict[str, Any]]) -> list[Candidate]:
    """從搜尋結果取出 IG 帳號（個人頁網址，或標題裡的 (@帳號)）。"""
    out = []
    for r in results:
        url, title = r.get("url") or "", r.get("title") or ""
        handle = ""
        m = _URL_HANDLE.search(url)
        if m and m.group(1).lower() not in IG_RESERVED:
            handle = m.group(1)
        elif m2 := _TITLE_HANDLE.search(title):
            handle = m2.group(1)
        if handle:
            out.append(Candidate(handle.lower().rstrip("."), title, f"{title} {r.get('content') or ''}"))
    return out


def score(m: Merchant, city_name: str, c: Candidate) -> tuple[float, list[str]]:
    """回傳 (分數, 理由)。店名和地點都要相符，否則分數為 0。"""
    reasons = []
    sim = max(name_similarity(n, c.title) for n in (m.name, m.registered_name) if n) if m.name else 0.0
    if sim >= MIN_SCORE:
        reasons.append(f"店名相似 {sim:.0%}")
    text = addr.to_tw(c.text)
    located = False
    p = addr.parse(m.address)
    for k in (city_name, city_name[:-1], p.road if p else ""):
        if k and len(k) >= 2 and addr.to_tw(k) in text:
            reasons.append(f"提到「{k}」")
            located = True
            break
    digits = re.sub(r"\D", "", m.phone)
    if len(digits) >= 8 and digits[-8:] in re.sub(r"\D", "", c.text):
        reasons.append("電話相符")
        located = True
    return (sim if located else 0.0), reasons


class IgFinder:
    def __init__(self, cache_path: Path, api_key: str | None) -> None:
        self.cache_path = cache_path
        self.api_key = api_key
        self.cache: dict[str, dict[str, Any]] = (
            json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
        )
        self.searches = 0

    def save(self) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps(self.cache, ensure_ascii=False, indent=1), encoding="utf-8")

    def apply_cached(self, m: Merchant) -> bool:
        hit = self.cache.get(m.id)
        if not m.ig and hit and hit.get("ig"):
            m.ig, m.ig_source = hit["ig"], "search"
            return True
        return False

    def _due(self, m: Merchant, today: date) -> bool:
        hit = self.cache.get(m.id)
        if not hit:
            return True
        if hit.get("ig"):
            return False
        return (today - date.fromisoformat(hit["checked"])).days >= RETRY_AFTER_DAYS

    def search(self, m: Merchant, city_name: str, today: date) -> bool:
        """查一家（若到期）；找到就套用。API 錯誤時拋出 RuntimeError。"""
        if not self.api_key or m.ig or not self._due(m, today):
            return False
        query = f"{m.name} {city_name} instagram"
        try:
            res = request_json(
                TAVILY_URL,
                data={
                    "query": query,
                    "max_results": 5,
                    "search_depth": "basic",
                    "include_domains": ["instagram.com"],
                },
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Tavily 錯誤 {e.code}") from e
        self.searches += 1
        scored = [(score(m, city_name, c), c) for c in candidates(res.get("results", []))]
        best = max(scored, key=lambda x: x[0][0], default=None)
        entry: dict[str, Any] = {"checked": today.isoformat(), "query": query}
        if best and best[0][0] >= MIN_SCORE:
            (s, reasons), c = best
            entry |= {"ig": c.handle, "confidence": round(s, 2), "evidence": reasons}
            m.ig, m.ig_source = c.handle, "search"
            log.info("  IG：%s → @%s（%s）", m.name, c.handle, "、".join(reasons))
        self.cache[m.id] = entry
        time.sleep(0.3)
        return bool(entry.get("ig"))
