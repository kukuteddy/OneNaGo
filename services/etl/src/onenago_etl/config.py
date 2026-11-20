"""讀取 config/（網站與 ETL 共用）。"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from .settings import CONFIG_DIR


@dataclass(frozen=True)
class Landmark:
    name: str
    query: str


@dataclass(frozen=True)
class City:
    slug: str
    name: str  # 例：竹北市、大安區
    county: str  # 例：新竹縣、臺北市（同名行政區靠它區分）
    landmarks: tuple[Landmark, ...] = ()


@dataclass(frozen=True)
class Hint:
    if_name_has: str
    label: str
    unless_name_has: str | None = None

    def matches(self, name: str) -> bool:
        return self.if_name_has in name and not (self.unless_name_has and self.unless_name_has in name)


@dataclass(frozen=True)
class Vertical:
    slug: str
    name: str
    industry_codes: frozenset[str]
    name_pattern: re.Pattern[str] | None
    source_note: str = ""
    hints: tuple[Hint, ...] = field(default_factory=tuple)

    def matches(self, name: str, codes: list[str]) -> bool:
        return bool(self.industry_codes.intersection(codes)) or bool(
            self.name_pattern and self.name_pattern.search(name)
        )


def load_cities(path: Path = CONFIG_DIR / "cities.json") -> list[City]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [
        City(
            slug=c["slug"],
            name=c["name"],
            county=c["county"],
            landmarks=tuple(Landmark(lm["name"], lm["query"]) for lm in c.get("landmarks", [])),
        )
        for c in raw
    ]


def load_verticals(path: Path = CONFIG_DIR / "verticals.json") -> list[Vertical]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [
        Vertical(
            slug=v["slug"],
            name=v["name"],
            industry_codes=frozenset(v.get("industryCodes", [])),
            name_pattern=re.compile(v["namePattern"]) if v.get("namePattern") else None,
            source_note=v.get("sourceNote", ""),
            hints=tuple(Hint(h["ifNameHas"], h["label"], h.get("unlessNameHas")) for h in v.get("hints", [])),
        )
        for v in raw
    ]


def pick[T: (City, Vertical)](items: list[T], slugs: list[str] | None) -> list[T]:
    """依 slug 篩選；slugs 為 None 時回傳全部。不存在的 slug 直接報錯。"""
    if not slugs:
        return items
    by_slug = {i.slug: i for i in items}
    missing = [s for s in slugs if s not in by_slug]
    if missing:
        raise SystemExit(f"config 沒有：{', '.join(missing)}（目前有：{', '.join(by_slug)}）")
    return [by_slug[s] for s in slugs]
