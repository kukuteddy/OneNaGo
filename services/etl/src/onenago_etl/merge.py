"""把多個來源的 Record 合併成店家（Merchant）。

規則：
1. 統一編號相同 → 同一家。
2. 門牌相同 → 同一家；但兩邊都有統編而且不同 → 不同店（同棟多間工作室）。
3. 都不符合 → 新店家。

合併時：
- 招牌名稱優先：政府登記名稱不覆蓋人工 / 網路取得的店名（另存 registered_name）。
- 其他欄位：新來源有值才補上；來源、行業、提示都取聯集。
"""

from __future__ import annotations

from .models import Merchant, Record, merchant_id
from .normalize import address as addr


class MerchantIndex:
    def __init__(self) -> None:
        self.merchants: dict[str, Merchant] = {}
        self._by_tax: dict[str, str] = {}
        self._by_addr: dict[str, str] = {}

    def __len__(self) -> int:
        return len(self.merchants)

    def _find(self, rec: Record) -> str | None:
        if rec.tax_id and rec.tax_id in self._by_tax:
            return self._by_tax[rec.tax_id]
        key = addr.match_key(rec.address)
        mid = self._by_addr.get(key) if key else None
        if mid:
            other_tax = self.merchants[mid].tax_id
            if rec.tax_id and other_tax and other_tax != rec.tax_id:
                return None  # 同門牌、不同統編 → 不同店
        return mid

    def add(self, rec: Record, *, vertical: str, city: str) -> tuple[Merchant, bool]:
        """回傳 (店家, 是否為新店家)。"""
        mid = self._find(rec)
        if mid is None:
            m = Merchant(
                id=merchant_id(rec),
                city_slug=city,
                name=rec.name,
                address=rec.address,
                kind=rec.kind or "shop",
                registered_name=rec.registered_name,
                tax_id=rec.tax_id,
                phone=rec.phone,
                ig=rec.ig,
                ig_source="manual" if rec.ig else "",
                line=rec.line,
                established=rec.established,
                sources={rec.source},
                verticals={vertical},
                hints=set(rec.hints),
            )
            self.merchants[m.id] = m
            created = True
        else:
            m = self.merchants[mid]
            self._merge_into(m, rec)
            m.verticals.add(vertical)
            created = False
        if m.tax_id:
            self._by_tax[m.tax_id] = m.id
        key = addr.match_key(m.address)
        if key:
            self._by_addr.setdefault(key, m.id)
        return m, created

    @staticmethod
    def _merge_into(m: Merchant, rec: Record) -> None:
        is_gov = rec.source == "gov_open_data"
        if rec.name and not is_gov:
            m.name = rec.name
        if rec.registered_name and not m.registered_name:
            m.registered_name = rec.registered_name
        if rec.tax_id and not m.tax_id:
            m.tax_id = rec.tax_id
        if rec.address and (not m.address or not is_gov) and rec.address != m.address:
            moved = addr.match_key(rec.address) != addr.match_key(m.address)
            m.address = rec.address
            if moved:  # 門牌真的不同才需要重新定位
                m.lat = m.lng = None
                m.geo_precision = ""
        for f in ("phone", "line"):
            if getattr(rec, f):
                setattr(m, f, getattr(rec, f))
        if rec.ig:
            m.ig, m.ig_source = rec.ig, "manual"
        if rec.established and not m.established:
            m.established = rec.established
        if rec.kind and (not is_gov or not m.kind):
            m.kind = rec.kind  # 人工 / 網路資料明確寫的類型，比從登記名稱猜的準
        m.sources.add(rec.source)
        m.hints.update(rec.hints)
