"""資料模型：來源紀錄（Record）→ 合併後的店家（Merchant）。"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date

# 決定性 UUID 命名空間：同一家店每次執行都得到同一個 ID（使用者回報靠它對應）
_NS = uuid.UUID("6f1c3a52-6a0e-4b8e-9a51-3d0c2f7e8b10")


@dataclass
class Record:
    """單一來源的一筆店家資料（還沒合併）。"""

    name: str
    address: str
    source: str  # gov_open_data / manual
    tax_id: str = ""
    registered_name: str = ""
    kind: str = "shop"
    phone: str = ""
    ig: str = ""
    line: str = ""
    established: date | None = None
    hints: list[str] = field(default_factory=list)


@dataclass
class Merchant:
    id: str
    city_slug: str
    name: str
    address: str
    kind: str = "shop"
    registered_name: str = ""
    tax_id: str = ""
    phone: str = ""
    ig: str = ""
    ig_source: str = ""  # manual / search / ugc
    line: str = ""
    established: date | None = None
    sources: set[str] = field(default_factory=set)
    verticals: set[str] = field(default_factory=set)
    hints: set[str] = field(default_factory=set)
    lat: float | None = None
    lng: float | None = None
    geo_precision: str = ""

    @property
    def short_id(self) -> str:
        return self.id.replace("-", "")[:8]


def merchant_id(rec: Record) -> str:
    """統一編號 → IG → 店名＋地址，取第一個有的當 ID 來源。"""
    if rec.tax_id:
        key = f"tax:{rec.tax_id}"
    elif rec.ig:
        key = f"ig:{rec.ig}"
    else:
        key = f"addr:{rec.name}|{rec.address}"
    return str(uuid.uuid5(_NS, key))
