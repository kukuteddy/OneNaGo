"""店名、IG 帳號、日期等文字處理。"""

from __future__ import annotations

import re
from datetime import date

_IG_RE = re.compile(r"(?:instagram\.com/)?@?([A-Za-z0-9_.]{1,30})/?$")
IG_RESERVED = frozenset(
    {"p", "reel", "reels", "explore", "stories", "accounts", "tv", "about", "developer", "legal"}
)
_NAME_NOISE = ("有限公司", "企業社", "工作室", "商行", "美學", "美甲", "沙龍", "nail", "studio")


def ig_handle(value: str) -> str:
    """@帳號、帳號、網址 → 小寫帳號；無法辨識（含貼文、Reels 網址）回傳空字串。"""
    v = (value or "").strip().split("?")[0].rstrip("/")
    if "instagram.com/" in v:
        # 網址只看第一段路徑：/p/、/reel/ 等是貼文，不是帳號
        v = v.split("instagram.com/", 1)[1].split("/")[0]
    m = _IG_RE.search(v)
    if not m:
        return ""
    handle = m.group(1).lower().rstrip(".")
    return "" if handle in IG_RESERVED else handle


def roc_date(s: str) -> date | None:
    """民國日期 1110329 → 2022-03-29。"""
    s = (s or "").strip()
    if len(s) == 7 and s.isdigit():
        try:
            return date(int(s[:3]) + 1911, int(s[3:5]), int(s[5:]))
        except ValueError:
            return None
    return None


def name_bigrams(s: str) -> set[str]:
    """店名比對用的雙字組，去掉「工作室、美甲」這類每家都有的字。"""
    s = re.sub(r"[\s・·。．.,，()（）|@_\-]", "", (s or "").lower())
    for w in _NAME_NOISE:
        s = s.replace(w, "")
    return {s[i : i + 2] for i in range(len(s) - 1)} or ({s} if s else set())


def name_similarity(a: str, b: str) -> float:
    """a 的雙字組有多少比例出現在 b 裡。"""
    ga = name_bigrams(a)
    return len(ga & name_bigrams(b)) / len(ga) if ga else 0.0


def guess_kind(name: str) -> str:
    return "studio" if re.search(r"工作室|工作坊|工作所", name) else "shop"
