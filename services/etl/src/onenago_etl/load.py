"""寫入 Supabase PostgreSQL（以資料庫連線，postgres 角色）。

- upsert：重複執行結果一樣（idempotent）。
- 這次處理的城市裡，沒再出現的店家標為 is_active = false（保留紀錄，不刪除）。
- 整批在同一個交易裡，失敗就全部不生效。
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterable
from pathlib import Path

import psycopg

from .config import City, Vertical
from .models import Merchant

log = logging.getLogger(__name__)

_UPSERT_MERCHANT = """
insert into public.merchants (id, short_id, city_slug, name, registered_name, tax_id, kind, address, road,
  lat, lng, geo_precision, phone, ig, ig_source, line, established, sources, hints,
  is_active, last_seen, updated_at)
values (%(id)s, %(short_id)s, %(city_slug)s, %(name)s, %(registered_name)s, %(tax_id)s, %(kind)s, %(address)s,
  %(road)s, %(lat)s, %(lng)s, %(geo_precision)s, %(phone)s, %(ig)s, %(ig_source)s, %(line)s, %(established)s,
  %(sources)s, %(hints)s, true, current_date, now())
on conflict (id) do update set
  short_id = excluded.short_id, city_slug = excluded.city_slug, name = excluded.name,
  registered_name = excluded.registered_name, tax_id = excluded.tax_id, kind = excluded.kind,
  address = excluded.address, road = excluded.road, lat = excluded.lat, lng = excluded.lng,
  geo_precision = excluded.geo_precision, phone = excluded.phone, ig = excluded.ig,
  ig_source = excluded.ig_source, line = excluded.line, established = excluded.established,
  sources = excluded.sources, hints = excluded.hints, is_active = true, last_seen = current_date,
  updated_at = now()
"""


def _nz(s: str) -> str | None:
    return s or None


def _row(m: Merchant, road: str) -> dict[str, object]:
    return {
        "id": m.id,
        "short_id": m.short_id,
        "city_slug": m.city_slug,
        "name": m.name,
        "registered_name": _nz(m.registered_name),
        "tax_id": _nz(m.tax_id),
        "kind": m.kind,
        "address": _nz(m.address),
        "road": _nz(road),
        "lat": m.lat,
        "lng": m.lng,
        "geo_precision": _nz(m.geo_precision),
        "phone": _nz(m.phone),
        "ig": _nz(m.ig),
        "ig_source": _nz(m.ig_source),
        "line": _nz(m.line),
        "established": m.established,
        "sources": sorted(m.sources),
        "hints": sorted(m.hints),
    }


def load(
    db_url: str,
    *,
    verticals: list[Vertical],
    cities: list[City],
    landmarks: dict[str, list[dict[str, object]]],
    merchants: Iterable[Merchant],
    roads: dict[str, str],
) -> None:
    ms = list(merchants)
    short_ids = [m.short_id for m in ms]
    if len(set(short_ids)) != len(short_ids):
        raise RuntimeError("short_id 重複，需要加長 ID")
    with psycopg.connect(db_url, autocommit=False) as conn, conn.cursor() as cur:
        for i, v in enumerate(verticals):
            cur.execute(
                "insert into public.verticals (slug, name, source_note, sort) values (%s, %s, %s, %s) "
                "on conflict (slug) do update set name = excluded.name, source_note = excluded.source_note, "
                "sort = excluded.sort",
                (v.slug, v.name, v.source_note, i),
            )
        for i, c in enumerate(cities):
            cur.execute(
                "insert into public.cities (slug, name, county, landmarks, sort) values (%s, %s, %s, %s, %s) "
                "on conflict (slug) do update set name = excluded.name, county = excluded.county, "
                "landmarks = excluded.landmarks, sort = excluded.sort",
                (c.slug, c.name, c.county, json.dumps(landmarks.get(c.slug, []), ensure_ascii=False), i),
            )
        cur.executemany(_UPSERT_MERCHANT, [_row(m, roads.get(m.id, "")) for m in ms])
        ids = [m.id for m in ms]
        city_slugs = [c.slug for c in cities]
        vertical_slugs = [v.slug for v in verticals]
        # 行業關聯：只重設這次處理的行業
        cur.execute(
            "delete from public.merchant_verticals where vertical_slug = any(%s) and merchant_id in "
            "(select id from public.merchants where city_slug = any(%s))",
            (vertical_slugs, city_slugs),
        )
        cur.executemany(
            "insert into public.merchant_verticals (merchant_id, vertical_slug) values (%s, %s) "
            "on conflict do nothing",
            [(m.id, v) for m in ms for v in sorted(m.verticals)],
        )
        # 停業：這次處理的城市裡，沒再出現、而且已經沒有任何行業的店家
        cur.execute(
            "update public.merchants set is_active = false, updated_at = now() "
            "where city_slug = any(%s) and is_active and not (id = any(%s::uuid[])) "
            "and not exists (select 1 from public.merchant_verticals mv where mv.merchant_id = merchants.id)",
            (city_slugs, ids),
        )
        deactivated = cur.rowcount
        conn.commit()
    log.info("寫入 Supabase：%d 家店（標為停業 %d 家）", len(ms), deactivated)


def migrate(db_url: str, migrations_dir: Path) -> list[str]:
    """依檔名順序套用 supabase/migrations/*.sql；已套用的記錄在 public.schema_migrations。"""
    applied: list[str] = []
    with psycopg.connect(db_url, autocommit=False) as conn, conn.cursor() as cur:
        cur.execute(
            "create table if not exists public.schema_migrations "
            "(name text primary key, applied_at timestamptz not null default now())"
        )
        cur.execute("alter table public.schema_migrations enable row level security")
        cur.execute("select name from public.schema_migrations")
        done = {r[0] for r in cur.fetchall()}
        for path in sorted(migrations_dir.glob("*.sql")):
            if path.name in done:
                continue
            log.info("套用 %s", path.name)
            cur.execute(path.read_text(encoding="utf-8").encode())
            cur.execute("insert into public.schema_migrations (name) values (%s)", (path.name,))
            applied.append(path.name)
        conn.commit()
    return applied
