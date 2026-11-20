"""台灣地址正規化：解析、比對鍵、行政區判斷。"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from ..config import City

_CITY_PREFIX_FIX = {"台北": "臺北", "台中": "臺中", "台南": "臺南", "台東": "臺東"}
_CN_DIGIT = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}

_ADDR_RE = re.compile(
    r"^(?P<admin>.{2}[市縣].{1,3}?[區鄉鎮市])?"
    r"(?:.{1,4}?里)?(?:\d+鄰)?"
    r"(?P<road>.+?(?:路|街|大道)(?:[東西南北]?[一二三四五六七八九十\d]+段)?)"
    r"(?P<lane>(?:\d+巷)?(?:\d+弄)?)"
    r"(?P<num>\d+(?:之\d+)?號)?"
)
_ADMIN_RE = re.compile(r"^(.{2}[市縣])(.{1,3}?[區鄉鎮市])")


@dataclass(frozen=True)
class ParsedAddress:
    road: str  # 例：光明六路東二段
    lane: str  # 例：216巷27弄
    number: str  # 例：1之2號

    @property
    def street(self) -> str:
        return self.road + self.lane


def to_tw(s: str) -> str:
    """「台」統一成「臺」，方便比對。"""
    return (s or "").replace("台", "臺")


def normalize(address: str) -> str:
    """全形轉半形、去郵遞區號、統一「臺」、門牌連字號改「之」。"""
    a = unicodedata.normalize("NFKC", address or "").strip().replace(" ", "")
    a = re.sub(r"^\d{3,6}", "", a)
    a = a.removeprefix("台灣").removeprefix("臺灣")
    for old, new in _CITY_PREFIX_FIX.items():
        if a.startswith(old):
            a = new + a[len(old) :]
    a = re.sub(r"(\d)[-－―‐](\d)", r"\1之\2", a)
    a = re.sub(r"(\d{3})鄰", lambda m: f"{int(m.group(1))}鄰", a)
    return a


def split_admin(address: str) -> tuple[str, str]:
    """回傳 (縣市, 鄉鎮市區)。"""
    m = _ADMIN_RE.match(address)
    return (m.group(1), m.group(2)) if m else ("", "")


def parse(address: str) -> ParsedAddress | None:
    m = _ADDR_RE.match(address)
    if not m or not m.group("road"):
        return None
    return ParsedAddress(m.group("road"), m.group("lane") or "", m.group("num") or "")


def _cn2num(s: str) -> int:
    if s == "十":
        return 10
    if "十" in s:
        tens, ones = s.split("十", 1)
        return _CN_DIGIT.get(tens, 1) * 10 + _CN_DIGIT.get(ones, 0)
    return _CN_DIGIT[s]


def match_key(address: str) -> str:
    """同一門牌的比對鍵：「段/街/路」前的國字數字轉阿拉伯數字，忽略里鄰與樓層。沒有門牌號回傳空字串。"""
    p = parse(address)
    if not p or not p.number:
        return ""
    key = p.road + p.lane + p.number
    return re.sub(r"([一二三四五六七八九十]+)(?=段|街|路)", lambda m: str(_cn2num(m.group(1))), key)


def in_city(address: str, city: City) -> bool:
    """地址是否在這個城市。一併比對縣市（大安區在臺北市和臺中市都有）。"""
    a = to_tw(address)
    return to_tw(city.name) in a and to_tw(city.county) in a
