"""指令進入點。

onenago-etl build --all                 # 所有行業 × 所有城市，寫入 Supabase
onenago-etl build --city zhubei --dry-run
onenago-etl migrate                     # 套用 supabase/migrations/
"""

from __future__ import annotations

import argparse
import json
import logging
from collections import Counter
from dataclasses import asdict
from datetime import date
from typing import Any

from . import load as loader
from .config import load_cities, load_verticals, pick
from .enrich.ig_search import IgFinder
from .geocode import Geocoder
from .merge import MerchantIndex
from .normalize import address as addr
from .settings import CACHE_DIR, MIGRATIONS_DIR, RAW_DIR, SEEDS_DIR, WORK_DIR, env, load_dotenv
from .sources import mof, seeds

log = logging.getLogger("onenago_etl")


def _json_default(o: Any) -> Any:
    if isinstance(o, set):
        return sorted(o)
    if isinstance(o, date):
        return o.isoformat()
    raise TypeError(type(o))


def cmd_build(args: argparse.Namespace) -> None:
    cities = pick(load_cities(), None if args.all else args.city)
    verticals = pick(load_verticals(), args.vertical)
    log.info("== 1/6 取得政府資料")
    csv_path = mof.fetch(RAW_DIR, force=args.refresh)

    log.info("== 2/6 篩選（%d 個行業 × %d 個城市，掃描一次）", len(verticals), len(cities))
    extracted = mof.extract(csv_path, verticals, cities)

    log.info("== 3/6 合併")
    index = MerchantIndex()
    for v in verticals:
        for c in cities:
            for rec in extracted[(v.slug, c.slug)] + seeds.load(SEEDS_DIR, v.slug, c.slug):
                index.add(rec, vertical=v.slug, city=c.slug)
    log.info("  共 %d 家", len(index))

    log.info("== 4/6 定位（有快取，只查新地址）")
    geo = Geocoder(CACHE_DIR / "geocode_cache.json")
    for m in index.merchants.values():
        if m.lat is None and m.address:
            geo.locate(m)
    landmarks: dict[str, list[dict[str, object]]] = {}
    for c in cities:
        pts = []
        for lm in c.landmarks:
            ll = geo.landmark(lm.query)
            if ll:
                pts.append({"name": lm.name, "lat": ll[0], "lng": ll[1]})
            else:
                log.warning("  地標定位失敗：%s", lm.name)
        landmarks[c.slug] = pts
    geo.save()
    log.info("  Nominatim 查詢 %d 次", geo.network_calls)

    log.info("== 5/6 找 IG（快取＋搜尋 API）")
    finder = IgFinder(CACHE_DIR / "ig_discovery.json", env("TAVILY_API_KEY"))
    city_name = {c.slug: c.name for c in cities}
    today = date.today()
    for m in index.merchants.values():
        if finder.apply_cached(m) or finder.searches >= args.search_budget:
            continue
        try:
            finder.search(m, city_name[m.city_slug], today)
        except RuntimeError as e:
            log.warning("  %s，停止搜尋", e)
            break
    finder.save()
    if not finder.api_key:
        log.info("  （沒有 TAVILY_API_KEY，只套用快取結果）")
    log.info("  搜尋 %d 次", finder.searches)

    ms = list(index.merchants.values())
    stats = Counter(
        k
        for m in ms
        for k, ok in (
            ("定位到門牌", m.geo_precision == "address"),
            ("有座標", m.lat is not None),
            ("有 IG", bool(m.ig)),
            ("多來源", len(m.sources) > 1),
        )
        if ok
    )
    log.info("  %d 家：%s", len(ms), "、".join(f"{k} {v}" for k, v in stats.items()))

    roads = {}
    for m in ms:
        p = addr.parse(m.address)
        roads[m.id] = p.street if p else ""
    WORK_DIR.mkdir(exist_ok=True)
    (WORK_DIR / "merchants.json").write_text(
        json.dumps([asdict(m) for m in ms], ensure_ascii=False, indent=1, default=_json_default),
        encoding="utf-8",
    )

    log.info("== 6/6 寫入資料庫")
    db_url = env("SUPABASE_DB_URL")
    if args.dry_run or not db_url:
        log.info(
            "  %s，略過（結果在 %s）",
            "dry-run" if args.dry_run else "沒有 SUPABASE_DB_URL",
            WORK_DIR / "merchants.json",
        )
        return
    loader.load(db_url, verticals=verticals, cities=cities, landmarks=landmarks, merchants=ms, roads=roads)


def cmd_migrate(args: argparse.Namespace) -> None:
    db_url = env("SUPABASE_DB_URL")
    if not db_url:
        raise SystemExit("缺少 SUPABASE_DB_URL")
    applied = loader.migrate(db_url, MIGRATIONS_DIR)
    log.info("套用 %d 個：%s", len(applied), "、".join(applied) or "（都已是最新）")


def main(argv: list[str] | None = None) -> None:
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    ap = argparse.ArgumentParser(
        prog="onenago-etl", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="下載 → 篩選 → 合併 → 定位 → 找 IG → 寫入 Supabase")
    g = b.add_mutually_exclusive_group(required=True)
    g.add_argument("--city", nargs="+", help="城市 slug，例：zhubei taipei-daan")
    g.add_argument("--all", action="store_true", help="config/cities.json 裡所有城市")
    b.add_argument("--vertical", nargs="+", help="行業 slug（預設全部），例：nail")
    b.add_argument("--refresh", action="store_true", help="強制重新下載政府資料")
    b.add_argument(
        "--search-budget", type=int, default=200, help="IG 搜尋次數上限（Tavily 免費 1,000 次/月）"
    )
    b.add_argument("--dry-run", action="store_true", help="不寫入資料庫")
    b.set_defaults(func=cmd_build)

    m = sub.add_parser("migrate", help="套用 supabase/migrations/")
    m.set_defaults(func=cmd_migrate)

    args = ap.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
