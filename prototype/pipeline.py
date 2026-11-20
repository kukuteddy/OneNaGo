"""
美甲店種子資料管線（零付費 API，只用 Python 標準函式庫）

流程：
  1. import    匯入人工整理的 CSV（店名 / IG / 地址…）→ data/merchants.json
  2. geocode   用 OpenStreetMap Nominatim（免費）把地址轉座標，逐級降精度
  3. ig        （選用）用 Instagram Graph API Business Discovery（免費）補作品
  4. report    覆蓋率統計
  5. sql       輸出 data/seed.sql，可直接匯入 db/schema.sql 建好的資料庫
  6. preview   輸出 data/preview.html，瀏覽器直接開，看列表 / 地圖 / 作品牆

範例：
  python pipeline.py import seeds/merchants.csv
  python pipeline.py geocode
  python pipeline.py report
  python pipeline.py sql
  python pipeline.py preview
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import shutil
import ssl
import uuid
import zipfile
from datetime import date
from email.utils import formatdate
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "data"          # 每次執行的產出（可刪除重建）
CACHE = ROOT / "cache"        # 定位快取（保留並版控）與政府原始檔（大檔，不版控）
CONFIG = ROOT / "config" / "cities.json"
NS = uuid.UUID("6f1c3a52-6a0e-4b8e-9a51-3d0c2f7e8b10")  # 決定性 UUID 命名空間

USER_AGENT = "OneNaGo/0.1 (github.com/kukuteddy/OneNaGo)"  # Nominatim 要求可識別的 UA
NOMINATIM = "https://nominatim.openstreetmap.org/search"


# ================================================================ utils

def load_env() -> None:
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def read_json(name: str, default=None):
    p = DATA / name
    if not p.exists():
        if default is not None:
            return default
        sys.exit(f"找不到 {p}，請先執行前一步")
    return json.loads(p.read_text(encoding="utf-8"))


def write_json(name: str, obj) -> Path:
    DATA.mkdir(exist_ok=True)
    p = DATA / name
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    return p


def http_json(url: str, headers: dict | None = None):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode(errors="replace")}
    except urllib.error.URLError as e:
        return {"_error": "network", "_body": str(e.reason)}


def city_config(city: str) -> dict:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    if city not in cfg:
        sys.exit(f"config/cities.json 沒有「{city}」，請先新增（目前有：{'、'.join(cfg)}）")
    return cfg[city]


def _tw(s: str) -> str:
    return (s or "").replace("台", "臺")


def in_area(addr: str, city: str) -> bool:
    """地址是否屬於某城市。有設定 county 時一併比對（大安區在臺北市和臺中市都有）。"""
    a = _tw(addr)
    if _tw(city) not in a:
        return False
    try:
        county = json.loads(CONFIG.read_text(encoding="utf-8")).get(city, {}).get("county")
    except FileNotFoundError:
        county = None
    return not county or _tw(county) in a


def load_geo_cache() -> dict:
    p = CACHE / "geocode_cache.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def save_geo_cache(c: dict) -> None:
    CACHE.mkdir(exist_ok=True)
    (CACHE / "geocode_cache.json").write_text(json.dumps(c, ensure_ascii=False, indent=1), encoding="utf-8")


# ================================================================ normalisation

CITY_FIX = {"台北": "臺北", "台中": "臺中", "台南": "臺南", "台東": "臺東"}
IG_RE = re.compile(r"(?:instagram\.com/)?@?([A-Za-z0-9_.]{1,30})/?$")


def norm_address(a: str) -> str:
    a = (a or "").strip().replace(" ", "")
    a = re.sub(r"^\d{3,6}", "", a)          # 郵遞區號
    a = re.sub(r"(\d)[-－―‐](\d)", r"\1之\2", a)  # 142-1號 → 142之1號
    a = re.sub(r"\d{3}鄰", lambda m: f"{int(m.group(0)[:3])}鄰", a)  # 002鄰 → 2鄰
    a = a.removeprefix("台灣").removeprefix("臺灣")
    for k, v in CITY_FIX.items():
        if a.startswith(k):
            a = v + a[len(k):]
    return a


def split_admin(addr: str) -> tuple[str, str]:
    """回傳 (縣市, 區)。"""
    m = re.match(r"^(.{2}[市縣])(.{1,3}?[區鄉鎮市])", addr)
    return (m.group(1), m.group(2)) if m else ("", "")


def strip_floor(addr: str) -> str:
    """去掉『號』之後的樓層 / 室號。"""
    m = re.match(r"^(.*?號)", addr)
    return m.group(1) if m else addr


ADDR_RE = re.compile(
    r"^(?P<admin>.{2}[市縣].{1,3}?[區鄉鎮市])?"
    r"(?:.{1,4}?里)?(?:\d+鄰)?"
    r"(?P<road>.+?(?:路|街|大道)(?:[東西南北]?[一二三四五六七八九十\d]+段)?)"
    r"(?P<lane>(?:\d+巷)?(?:\d+弄)?)"
    r"(?P<num>\d+(?:之\d+)?號)?"
)


def parse_address(addr: str) -> dict:
    m = ADDR_RE.match(addr)
    return m.groupdict(default="") if m else {}


def road_part(addr: str) -> str:
    return parse_address(addr).get("road", "")


def norm_ig(v: str) -> str:
    v = (v or "").strip().rstrip("/")
    if not v:
        return ""
    v = v.split("?")[0]
    m = IG_RE.search(v)
    return m.group(1).lower().rstrip(".") if m else ""


def to_int(v) -> int | None:
    v = re.sub(r"[^\d]", "", str(v or ""))
    return int(v) if v else None


def merchant_id(m: dict) -> str:
    if m.get("tax_id"):
        key = f"tax:{m['tax_id']}"
    elif m.get("ig"):
        key = f"ig:{m['ig']}"
    else:
        key = f"addr:{m['name']}|{m['address']}"
    return str(uuid.uuid5(NS, key))


CN_DIGIT = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def cn2num(s: str) -> int:
    if s == "十":
        return 10
    if "十" in s:
        a, b = s.split("十", 1)
        return (CN_DIGIT.get(a, 1)) * 10 + (CN_DIGIT.get(b, 0))
    return CN_DIGIT[s]


def addr_key(addr: str) -> str:
    """同一門牌的比對鍵：國字數字（段/街/路前）轉阿拉伯數字，忽略里鄰與樓層。"""
    p = parse_address(addr)
    if not p or not p.get("road") or not p.get("num"):
        return ""
    s = p["road"] + p["lane"] + p["num"]
    return re.sub(r"([一二三四五六七八九十]+)(?=段|街|路)", lambda m: str(cn2num(m.group(1))), s)


# ================================================================ 1. import

CSV_FIELDS = ["name", "kind", "ig", "address", "phone", "line", "booking_url", "price_from", "notes",
              "source", "tax_id", "registered_name", "established"]
SOURCES = {"google", "instagram", "gov_open_data", "manual", "ugc", "claimed"}


def cmd_import(args) -> None:
    src = Path(args.csv)
    existing = {m["id"]: m for m in read_json("merchants.json", [])}
    by_addr = {addr_key(m["address"]): m["id"] for m in existing.values() if addr_key(m["address"])}
    by_tax = {m["tax_id"]: m["id"] for m in existing.values() if m.get("tax_id")}
    added = merged = skipped = 0
    with open(src, encoding="utf-8-sig", newline="") as f:
        for i, row in enumerate(csv.DictReader(f), start=2):
            row = {k: (row.get(k) or "").strip() for k in CSV_FIELDS}
            if not row["name"] or row["name"].startswith("#"):
                skipped += 1
                continue
            addr = norm_address(row["address"])
            city, district = split_admin(addr)
            source = row["source"] if row["source"] in SOURCES else "manual"
            m = {
                "name": row["name"],
                "kind": row["kind"] if row["kind"] in ("shop", "studio", "mobile") else "shop",
                "ig": norm_ig(row["ig"]),
                "address": addr,
                "city": city,
                "district": district,
                "phone": row["phone"],
                "line": row["line"],
                "booking_url": row["booking_url"],
                "price_from": to_int(row["price_from"]),
                "notes": row["notes"],
                "source": source,
                "tax_id": row["tax_id"],
                "registered_name": row["registered_name"],
                "established": row["established"],
                "area": getattr(args, "area", None) or "",
                "verticals": [args.vertical] if getattr(args, "vertical", None) else [],
            }
            if row["ig"] and not m["ig"]:
                print(f"  ⚠ 第 {i} 行 IG 格式無法辨識：{row['ig']}")

            # 同一家店：統一編號相同，或門牌相同 → 合併而不新增
            key = addr_key(addr)
            same_addr = by_addr.get(key)
            if same_addr and m["tax_id"] and existing[same_addr].get("tax_id") not in ("", None, m["tax_id"]):
                same_addr = None  # 同門牌但統編不同 = 不同店家（例：同棟不同工作室）
            mid = by_tax.get(m["tax_id"]) or same_addr or merchant_id(m)
            if mid in existing:
                old = existing[mid]
                new = dict(old)
                for k, v in m.items():
                    if v in ("", None):
                        continue
                    if k == "name" and source == "gov_open_data" and old.get("name"):
                        continue  # 登記名稱常與招牌不同，不覆蓋人工/網路取得的店名
                    if k == "notes" and old.get("notes") and v not in old["notes"]:
                        v = old["notes"] + "；" + v
                    if k == "source" and old.get("source") and old["source"] != v:
                        v = old["source"]  # 保留最初來源
                    new[k] = v
                new["sources"] = sorted(set(old.get("sources") or [old.get("source")]) | {source})
                new["verticals"] = sorted(set(old.get("verticals") or []) | set(m["verticals"]))
                if addr_key(old.get("address", "")) != key:  # 門牌變了 → 重新定位
                    for k in ("lat", "lng", "geo_precision"):
                        new.pop(k, None)
                existing[mid] = new
                merged += 1
            else:
                m["id"] = mid
                m["sources"] = [source]
                existing[mid] = m
                added += 1
            if key:
                by_addr[key] = mid
            if m["tax_id"]:
                by_tax[m["tax_id"]] = mid
    p = write_json("merchants.json", list(existing.values()))
    print(f"新增 {added}、合併 {merged}、略過 {skipped} → {p}（共 {len(existing)} 家）")


# ================================================================ 1b. 財政部稅籍登記（免費政府開放資料）

MOF_URL = "https://eip.fia.gov.tw/data/BGMOPEN1.zip"
VERTICALS = ROOT / "config" / "verticals.json"


def load_verticals() -> dict:
    return json.loads(VERTICALS.read_text(encoding="utf-8"))


def vertical_config(v: str) -> dict:
    cfg = load_verticals()
    if v not in cfg:
        sys.exit(f"config/verticals.json 沒有「{v}」（目前有：{'、'.join(cfg)}）")
    return cfg[v]


def hint_labels(vcfg: dict, name: str) -> list[str]:
    return [h["label"] for h in vcfg.get("hints", [])
            if h["if_name_has"] in name and h.get("unless_name_has", "\0") not in name]


def roc_date(s: str) -> str:
    s = s.strip()
    if len(s) == 7 and s.isdigit():
        return f"{int(s[:3]) + 1911}-{s[3:5]}-{s[5:]}"
    return s


def mof_source_path(vertical: str, city: str) -> Path:
    return DATA / "sources" / f"{vertical}_{city}.csv"


def extract_mof(csv_path, targets: list[tuple[str, str]]) -> dict[tuple[str, str], int]:
    """掃描一次政府資料（約 300MB），同時篩出多組（行業, 城市）。"""
    import unicodedata

    vcfg = load_verticals()
    rules = {}
    for v in {v for v, _ in targets}:
        c = vcfg[v]
        pat = re.compile(c["name_pattern"]) if c.get("name_pattern") else None
        rules[v] = (set(c.get("industry_codes", [])), pat, c)
    files, writers, counts = [], {}, {}
    try:
        for t in targets:
            p = mof_source_path(*t)
            p.parent.mkdir(parents=True, exist_ok=True)
            f = open(p, "w", encoding="utf-8-sig", newline="")
            files.append(f)
            writers[t] = csv.DictWriter(f, fieldnames=CSV_FIELDS)
            writers[t].writeheader()
            counts[t] = 0
        with open(csv_path, encoding="utf-8", newline="") as f:
            r = csv.reader(f)
            next(r)  # 欄位名
            next(r)  # 資料日期
            for row in r:
                if len(row) < 10:
                    continue
                addr = unicodedata.normalize("NFKC", row[0])
                hits = [t for t in targets if in_area(addr, t[1])]
                if not hits:
                    continue
                name = unicodedata.normalize("NFKC", row[3]).strip()
                inds = [(row[i], row[i + 1]) for i in (8, 10, 12, 14) if i + 1 < len(row) and row[i]]
                for v, city in hits:
                    codes, pat, c = rules[v]
                    if not (any(code in codes for code, _ in inds) or (pat and pat.search(name))):
                        continue
                    notes = [f"來源：財政部稅籍登記（設立 {roc_date(row[5])}）", "行業：" + "、".join(x for _, x in inds)]
                    notes += [f"提示：{x}" for x in hint_labels(c, name)]
                    writers[(v, city)].writerow({
                        "name": name,
                        "kind": "studio" if re.search(r"工作室|工作坊|工作所", name) else "shop",
                        "address": addr,
                        "source": "gov_open_data",
                        "tax_id": row[1].strip(),
                        "registered_name": name,
                        "established": roc_date(row[5]),
                        "notes": "；".join(notes),
                    })
                    counts[(v, city)] += 1
    finally:
        for f in files:
            f.close()
    for (v, city), n in counts.items():
        print(f"  {vcfg[v]['name']}・{city}：{n} 家")
    return counts


def cmd_mof(args) -> None:
    extract_mof(args.csv, [(args.vertical, c) for c in args.city])


# ================================================================ 2. geocode

def nominatim(params: dict):
    url = NOMINATIM + "?" + urllib.parse.urlencode(
        {**params, "format": "jsonv2", "limit": 1, "countrycodes": "tw", "accept-language": "zh-TW"}
    )
    res = http_json(url)
    time.sleep(1.1)  # 使用政策：最多每秒 1 次
    if isinstance(res, dict) and "_error" in res:
        print(f"    Nominatim 錯誤 {res['_error']}: {res['_body'][:200]}")
        return None
    return res[0] if res else None


def cmd_geocode(args) -> None:
    merchants = read_json("merchants.json")
    cache = load_geo_cache()
    todo = [m for m in merchants if args.force or "lat" not in m]
    print(f"待定位：{len(todo)} 家（查過的地址直接用快取；新地址每秒查 1 筆）")
    for m in todo:
        addr = m["address"]
        if not addr:
            print(f"  - {m['name']}：無地址，略過")
            continue
        # 台灣地址用自由文字查幾乎都失敗；結構化查詢 street="1號 羅斯福路四段" 才能到門牌
        p = parse_address(addr)
        cands = []
        if p.get("road"):
            street = p["road"] + p["lane"]
            if p["num"]:
                cands.append(({"street": f"{p['num']} {street}", "city": m["city"]}, "address"))
            if p["lane"]:
                cands.append(({"q": f"{m['city']}{m['district']}{street}"}, "lane"))
            cands.append(({"q": f"{m['city']}{m['district']}{p['road']}"}, "road"))
        if m["city"] and m["district"]:
            cands.append(({"q": m["city"] + m["district"]}, "district"))
        hit = None
        for params, prec in cands:
            key = json.dumps(params, ensure_ascii=False, sort_keys=True)
            if key in cache:
                r = cache[key]
            else:
                r = nominatim(params)
                cache[key] = r
            if r:
                hit = (r, prec)
                break
        if hit:
            r, prec = hit
            m["lat"], m["lng"], m["geo_precision"] = float(r["lat"]), float(r["lon"]), prec
            print(f"  ✓ {m['name']}：{prec}（{m['lat']:.5f}, {m['lng']:.5f}）")
        else:
            print(f"  ✗ {m['name']}：找不到，請手動補 lat/lng")
    save_geo_cache(cache)
    write_json("merchants.json", merchants)


# ================================================================ 3. instagram

def cmd_ig(args) -> None:
    token, me = os.environ.get("IG_ACCESS_TOKEN"), os.environ.get("IG_USER_ID")
    if not token or not me:
        sys.exit("缺少 IG_ACCESS_TOKEN / IG_USER_ID（填在 prototype/.env），此步驟可先跳過")
    ver = os.environ.get("GRAPH_API_VERSION", "v21.0")
    merchants = read_json("merchants.json")
    store = read_json("ig.json", {})
    for m in merchants:
        user = m.get("ig")
        if not user:
            continue
        fields = (
            f"business_discovery.username({user})"
            "{username,name,biography,website,followers_count,media_count,"
            f"media.limit({args.media}){{id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count}}}}"
        )
        url = f"https://graph.facebook.com/{ver}/{me}?" + urllib.parse.urlencode(
            {"fields": fields, "access_token": token}
        )
        res = http_json(url)
        now = datetime.now(timezone.utc).isoformat()
        if "_error" in res:
            store[user] = {"error": str(res["_body"])[:300], "fetched_at": now}
            print(f"  ✗ @{user}（個人帳號、私人帳號或已改名）")
        else:
            store[user] = {**res.get("business_discovery", {}), "fetched_at": now}
            print(f"  ✓ @{user}  貼文 {store[user].get('media_count')}")
        time.sleep(0.5)
    write_json("ig.json", store)


# ================================================================ 4. report

def cmd_report(args) -> None:
    ms = read_json("merchants.json")
    ig = read_json("ig.json", {})
    n = len(ms) or 1

    def pct(x):
        return f"{x}（{x / n:.0%}）"

    ig_ok = [u for u, v in ig.items() if "error" not in v]
    lines = [
        "# 種子資料報告",
        "",
        f"- 店家數：{len(ms)}",
        f"- 類型：" + "、".join(f"{k} {v}" for k, v in Counter(m["kind"] for m in ms).items()),
        f"- 有 IG：{pct(sum(1 for m in ms if m['ig']))}",
        f"- 有 LINE：{pct(sum(1 for m in ms if m['line']))}",
        f"- 有線上預約連結：{pct(sum(1 for m in ms if m['booking_url']))}",
        f"- 有起價：{pct(sum(1 for m in ms if m['price_from']))}",
        f"- 已定位：{pct(sum(1 for m in ms if 'lat' in m))}"
        + "（" + "、".join(f"{k} {v}" for k, v in Counter(m.get('geo_precision') for m in ms if 'lat' in m).items()) + "）",
        f"- IG 抓取成功：{len(ig_ok)} / {len(ig)}",
        "",
        "## 各區",
        *[f"- {k or '（未知）'}：{v}" for k, v in Counter(m["district"] for m in ms).most_common()],
    ]
    missing = [m["name"] for m in ms if "lat" not in m]
    if missing:
        lines += ["", "## 待補座標", *[f"- {x}" for x in missing]]
    text = "\n".join(lines)
    print(text)
    (DATA / "report.md").write_text(text, encoding="utf-8")


# ================================================================ 5. sql

def q(v) -> str:
    if v is None or v == "":
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def cmd_sql(args) -> None:
    ms = read_json("merchants.json")
    ig = read_json("ig.json", {})
    out = ["-- 由 pipeline.py sql 產生；需先套用 db/schema.sql", "begin;"]
    vcfg = load_verticals()
    for v, c in vcfg.items():  # 行業分類（橫向擴展：新增行業只改 config）
        out.append(f"insert into categories (slug, name) values ({q(v)}, {q(c['name'])}) on conflict (slug) do nothing;")

    def cat(v):
        return f"(select id from categories where slug = {q(v)})"

    for m in ms:
        verts = m.get("verticals") or ["nail"]
        nail = cat(verts[0])  # 服務 / 作品歸到主行業
        loc = (
            f"ST_SetSRID(ST_MakePoint({m['lng']}, {m['lat']}), 4326)::geography"
            if "lat" in m
            else "null"
        )
        out.append(
            "insert into merchants (id, kind, name, registered_name, tax_id, address, district, city, location, phone, source) values "
            f"({q(m['id'])}, {q(m['kind'])}, {q(m['name'])}, {q(m.get('registered_name'))}, {q(m.get('tax_id'))}, "
            f"{q(m['address'])}, {q(m['district'])}, {q(m['city'])}, {loc}, {q(m['phone'])}, {q(m.get('source') or 'manual')}) "
            "on conflict (id) do update set kind = excluded.kind, name = excluded.name, "
            "registered_name = excluded.registered_name, tax_id = excluded.tax_id, address = excluded.address, "
            "district = excluded.district, city = excluded.city, location = excluded.location, "
            "phone = excluded.phone, updated_at = now();"
        )
        for v in verts:
            out.append(
                f"insert into merchant_categories values ({q(m['id'])}, {cat(v)}) on conflict do nothing;"
            )
        refs = []
        if m["ig"]:
            refs.append(("instagram", m["ig"], f"https://www.instagram.com/{m['ig']}/"))
        if m["line"]:
            refs.append(("line", m["line"], m["line"] if m["line"].startswith("http") else None))
        if m["booking_url"]:
            refs.append(("booking", m["booking_url"], m["booking_url"]))
        for kind, ext, url in refs:
            out.append(
                "insert into external_refs (merchant_id, kind, external_id, url) values "
                f"({q(m['id'])}, '{kind}', {q(ext)}, {q(url)}) on conflict (kind, external_id) do nothing;"
            )
        if m["price_from"]:
            sid = uuid.uuid5(NS, f"svc:{m['id']}:base")
            out.append(
                "insert into services (id, merchant_id, category_id, name, price_min, source) values "
                f"({q(str(sid))}, {q(m['id'])}, {nail}, '單色凝膠（手）', {m['price_from']}, 'manual') "
                "on conflict (id) do update set price_min = excluded.price_min;"
            )
        # IG 作品：只存 permalink（以嵌入方式顯示，不轉存圖片）
        for media in (ig.get(m["ig"], {}).get("media", {}) or {}).get("data", []) if m["ig"] else []:
            if not media.get("permalink"):
                continue
            wid = uuid.uuid5(NS, f"work:{media['permalink']}")
            done = (media.get("timestamp") or "")[:10] or None
            out.append(
                "insert into works (id, category_id, merchant_id, source, permalink, status, done_on) values "
                f"({q(str(wid))}, {nail}, {q(m['id'])}, 'instagram', {q(media['permalink'])}, 'published', {q(done)}) "
                "on conflict (id) do nothing;"
            )
    out.append("commit;")
    p = DATA / "seed.sql"
    p.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"→ {p}（{len(ms)} 家店）")


# ================================================================ 6. site

def years_since(d: str) -> float | None:
    try:
        y, mo, dd = (int(x) for x in d.split("-"))
        return round((date.today() - date(y, mo, dd)).days / 365.25, 2)
    except (ValueError, AttributeError):
        return None


def city_landmarks(city: str) -> list[dict]:
    """依 config/cities.json 的地標查詢字串自動定位（有快取）。"""
    cache = load_geo_cache()
    out = []
    for lm in city_config(city).get("landmarks", []):
        if "lat" in lm:
            out.append(lm)
            continue
        params = {"q": lm["query"]}
        key = json.dumps(params, ensure_ascii=False, sort_keys=True)
        if key not in cache:
            cache[key] = nominatim(params)
        r = cache[key]
        if r:
            out.append({"name": lm["name"], "lat": float(r["lat"]), "lng": float(r["lon"])})
        else:
            print(f"  ⚠ 地標定位失敗：{lm['name']}（{lm['query']}），可在 config 直接填 lat/lng")
    save_geo_cache(cache)
    return out


BRAND = ROOT.parent / "brand"
BRAND_ORANGE, BRAND_PAPER = "#FF6827", "#FEFDF9"


def favicon_uri() -> str:
    svg = (BRAND / "app-icon.svg").read_text(encoding="utf-8")
    svg = re.sub(r"\s+", " ", svg).strip()
    # # 和 " 必須編碼：# 會被當成網址片段，" 會截斷 HTML 屬性
    return "data:image/svg+xml," + urllib.parse.quote(svg, safe=" =:/'(),.-")


def write_brand_assets() -> None:
    """產生網站用的品牌素材：PWA manifest、圖示、首頁主視覺（來源是 brand/）。"""
    pub = DATA / "public"
    assets = pub / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(BRAND / "app-icon.svg", assets / "icon.svg")
    shutil.copyfile(BRAND / "logo-pin.svg", assets / "logo-pin.svg")
    icons = [{"src": "assets/icon.svg", "sizes": "any", "type": "image/svg+xml"}]
    try:
        from PIL import Image  # 選用：沒裝就只用 SVG

        src = Image.open(BRAND / "source" / "app-icon.jpg").convert("RGB")
        for n in (192, 512):
            src.resize((n, n), Image.LANCZOS).save(assets / f"icon-{n}.png", optimize=True)
            icons.append({"src": f"assets/icon-{n}.png", "sizes": f"{n}x{n}", "type": "image/png", "purpose": "any maskable"})
        hero = Image.open(BRAND / "source" / "banner-hero.jpg").convert("RGB")
        w, h = hero.size
        photo = hero.crop((int(w * 0.5), 0, w, h))  # 右半邊騎樓照片
        photo.thumbnail((900, 900), Image.LANCZOS)
        photo.save(assets / "hero.webp", quality=72, method=6)
    except ImportError:
        print("  （未安裝 Pillow，略過 PNG 圖示與主視覺）")
    manifest = {
        "name": "玩哪走 OneNaGo",
        "short_name": "OneNaGo",
        "description": "台灣在地生活指南",
        "lang": "zh-Hant-TW",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "background_color": BRAND_PAPER,
        "theme_color": BRAND_ORANGE,
        "icons": icons,
    }
    (pub / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def standalone_page(body: str) -> str:
    return ('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            '</head><body>' + body + "</body></html>")


def cmd_site(args) -> int:
    city, v = args.city, args.vertical
    vcfg = vertical_config(v)
    slug = city_config(city).get("slug") or city
    ms = [m for m in read_json("merchants.json")
          if v in (m.get("verticals") or [])
          and (m.get("area") == city or in_area(m.get("address") or "", city))]
    rows = []
    for m in ms:
        p = parse_address(m.get("address") or "")
        rows.append({
            "id": m["id"],
            "name": m["name"],
            "reg": m.get("registered_name") or "",
            "kind": m["kind"],
            "ig": m.get("ig") or "",
            "line": m.get("line") or "",
            "phone": m.get("phone") or "",
            "address": m.get("address") or "",
            "road": (p.get("road") or "") + (p.get("lane") or ""),
            "lat": m.get("lat"),
            "lng": m.get("lng"),
            "prec": m.get("geo_precision"),
            "years": years_since(m.get("established") or ""),
            "verified": len(m.get("sources") or []) > 1,  # 多個獨立來源都指向同一家
            "warn": next((h["label"] for h in vcfg.get("hints", [])
                          if f"提示：{h['label']}" in (m.get("notes") or "")), ""),
        })
    lms = city_landmarks(city) or [{"name": city, "lat": 0, "lng": 0}]
    meta = {"city": city, "vertical": v, "updated": date.today().isoformat(), "landmarks": lms}

    def js(o):
        return json.dumps(o, ensure_ascii=False).replace("</", "<\\/")

    body = (ROOT / "templates" / "app.html").read_text(encoding="utf-8")
    for k, val in {"__CITY__": city, "__VNAME__": vcfg["name"], "__SOURCE_NOTE__": vcfg.get("source_note", "")}.items():
        body = body.replace(k, html.escape(val))
    body = body.replace("__META__", js(meta)).replace("__DATA__", js(rows)).replace("__FAVICON__", favicon_uri())
    # 公開網站：/<行業>/<城市>/（GitHub Pages / Cloudflare Pages / 本機雙擊）
    pub = DATA / "public" / v / slug
    pub.mkdir(parents=True, exist_ok=True)
    (pub / "index.html").write_text(standalone_page(body), encoding="utf-8")
    # Claude Artifact 版本（外層 skeleton 由平台提供）
    art = DATA / "artifact"
    art.mkdir(parents=True, exist_ok=True)
    (art / f"{v}-{slug}.html").write_text(body, encoding="utf-8")
    print(f"→ {pub / 'index.html'}（{len(rows)} 家）")
    return len(rows)


def write_home(counts: dict[tuple[str, str], int]) -> None:
    """網站首頁：品牌主視覺 + 依行業分組的城市列表。"""
    write_brand_assets()
    cities = json.loads(CONFIG.read_text(encoding="utf-8"))
    vcfg = load_verticals()
    total = sum(counts.values())
    sections = []
    for v in dict.fromkeys(v for v, _ in counts):
        cards = "".join(
            f'<a class="c" href="{html.escape(v)}/{html.escape(cities[c].get("slug") or c)}/">'
            f'<b>{html.escape(c)}</b><span>{html.escape(cities[c].get("county", ""))}・{n} 家</span>'
            f'<i aria-hidden="true">›</i></a>'
            for (vv, c), n in counts.items() if vv == v
        )
        sections.append(f'<section><h2>{html.escape(vcfg[v]["name"])}</h2><div class="g">{cards}</div></section>')
    hero_img = '<img class="photo" src="assets/hero.webp" alt="台灣騎樓街景">' if (DATA / "public" / "assets" / "hero.webp").exists() else ""
    body = f"""<title>玩哪走 OneNaGo</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="{BRAND_ORANGE}">
<meta name="description" content="玩哪走 OneNaGo：台灣在地生活指南。依行業、城市一次比較附近店家。">
<link rel="icon" href="{favicon_uri()}">
<link rel="manifest" href="manifest.webmanifest">
<style>
/* Layout: 品牌主視覺（左字右照）＋ 依行業分組的城市卡片 */
:root {{ --bg:#f6f4f2; --surface:#fff; --ink:#222; --ink-2:#6f6866; --line:#ece8e6; --brand:{BRAND_ORANGE}; --paper:{BRAND_PAPER}; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#121010; --surface:#1d1a19; --ink:#f1edeb; --ink-2:#b3aaa6; --line:#2d2928; --brand:#FF7A45; --paper:#1d1a19; color-scheme:dark; }} }}
:root[data-theme="dark"] {{ --bg:#121010; --surface:#1d1a19; --ink:#f1edeb; --ink-2:#b3aaa6; --line:#2d2928; --brand:#FF7A45; --paper:#1d1a19; color-scheme:dark; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:15px system-ui,-apple-system,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif; }}
.wrap {{ max-width:880px; margin:0 auto; padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px)); }}
.hero {{ background:var(--paper); border-bottom:1px solid var(--line); }}
.hero .wrap {{ display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:24px; align-items:center; padding-block:28px; }}
.mark {{ width:72px; height:auto; display:block; }}
h1 {{ margin:14px 0 4px; font-size:clamp(34px, 7vw, 52px); line-height:1.05; font-weight:900; letter-spacing:.02em; text-wrap:balance; }}
.en {{ display:block; font-size:.62em; font-weight:800; letter-spacing:0; color:var(--brand); margin-top:6px; font-family:"Avenir Next","Segoe UI",system-ui,sans-serif; }}
.tag {{ margin:10px 0 0; font-size:18px; color:var(--ink-2); }}
.rule {{ width:120px; height:5px; border-radius:5px; background:var(--brand); margin-top:16px; }}
.stat {{ margin-top:14px; font-size:13px; color:var(--ink-2); font-variant-numeric:tabular-nums; }}
.photo {{ width:100%; max-width:100%; aspect-ratio:4/5; object-fit:cover; border-radius:16px; display:block; }}
main.wrap {{ padding-block:8px 32px; display:grid; gap:8px; }}
h2 {{ margin:20px 0 10px; font-size:17px; display:flex; align-items:center; gap:8px; }}
h2::before {{ content:""; width:4px; height:16px; border-radius:2px; background:var(--brand); }}
.g {{ display:grid; gap:10px; grid-template-columns:repeat(auto-fill, minmax(min(220px, 100%), 1fr)); }}
.c {{ position:relative; display:grid; gap:3px; background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:16px 36px 16px 16px; color:inherit; text-decoration:none; }}
.c:hover, .c:focus-visible {{ border-color:var(--brand); outline:none; }}
.c b {{ font-size:17px; }}
.c span {{ color:var(--ink-2); font-size:13px; }}
.c i {{ position:absolute; right:14px; top:50%; transform:translateY(-50%); font-style:normal; font-size:22px; color:var(--brand); }}
.soon {{ color:var(--ink-2); font-size:13px; margin-top:6px; }}
footer {{ color:var(--ink-2); font-size:12px; padding-block:8px 32px; line-height:1.6; }}
@media (max-width:640px) {{
  .hero .wrap {{ grid-template-columns:1fr; }}
  .photo {{ aspect-ratio:16/10; }}
}}
</style>
<header class="hero">
  <div class="wrap">
    <div>
      <img class="mark" src="assets/logo-pin.svg" alt="">
      <h1>玩哪走<span class="en">OneNaGo</span></h1>
      <p class="tag">台灣在地生活指南</p>
      <div class="rule"></div>
      <p class="stat">已收錄 {total} 家店家，每週自動更新</p>
    </div>
    {hero_img}
  </div>
</header>
<main class="wrap">
  {"".join(sections)}
  <p class="soon">更多行業與城市陸續加入中。</p>
</main>
<footer class="wrap">
  © 玩哪走 OneNaGo・資料來源為財政部稅籍登記與公開網路資訊，自動彙整，非合作店家。更新於 {date.today().isoformat()}
</footer>"""
    (DATA / "public" / "index.html").write_text(standalone_page(body), encoding="utf-8")
    print(f"→ {DATA / 'public' / 'index.html'}（首頁）")


# ================================================================ 7. build（全自動）

def fetch_mof(force: bool = False) -> Path:
    """下載財政部稅籍登記；用 If-Modified-Since，沒更新就沿用快取。只解出指定 CSV（避免 zip 路徑穿越）。"""
    d = CACHE / "mof"
    d.mkdir(parents=True, exist_ok=True)
    z, out = d / "BGMOPEN1.zip", d / "BGMOPEN1.csv"
    req = urllib.request.Request(MOF_URL, headers={"User-Agent": USER_AGENT})
    if z.exists() and not force:
        req.add_header("If-Modified-Since", formatdate(z.stat().st_mtime, usegmt=True))
    # 財政部憑證缺 Subject Key Identifier，Python 3.13+ 的 X509_STRICT 會拒絕；
    # 只關掉 strict 旗標，憑證鏈與主機名稱仍照常驗證。
    ctx = ssl.create_default_context()
    ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    try:
        with urllib.request.urlopen(req, timeout=600, context=ctx) as r:
            tmp = z.with_suffix(".part")
            with open(tmp, "wb") as f:
                shutil.copyfileobj(r, f)
            tmp.replace(z)
            print(f"財政部資料已下載（{z.stat().st_size // 1_000_000} MB）")
    except urllib.error.HTTPError as e:
        if e.code != 304:
            if not z.exists():
                raise
            print(f"⚠ 下載失敗（HTTP {e.code}），沿用上次快取")
        else:
            print("財政部資料未更新，沿用快取")
    except urllib.error.URLError as e:
        if not z.exists():
            raise
        print(f"⚠ 下載失敗（{e.reason}），沿用上次快取")
    if not out.exists() or out.stat().st_mtime < z.stat().st_mtime:
        with zipfile.ZipFile(z) as zf:
            member = next(n for n in zf.namelist() if n.lower().endswith("bgmopen1.csv"))
            with zf.open(member) as src, open(out, "wb") as dst:
                shutil.copyfileobj(src, dst)
    return out


def cmd_build(args) -> None:
    """一個指令跑完：下載 → 篩選 → 合併 → 定位 →（IG）→ 報告 → SQL → 網站。"""
    cities = list(json.loads(CONFIG.read_text(encoding="utf-8"))) if args.all else args.city
    verticals = list(load_verticals()) if args.all or not args.vertical else args.vertical
    for c in cities:
        city_config(c)  # 確認有設定
    for v in verticals:
        vertical_config(v)
    targets = [(v, c) for v in verticals for c in cities]
    ns = argparse.Namespace
    # 每次從頭合併（定位有快取，所以很快）→ 已註銷的店自然消失
    (DATA / "merchants.json").unlink(missing_ok=True)
    print("=== 1/6 取得政府資料 ===")
    mof_csv = fetch_mof(force=args.refresh)
    print(f"=== 2/6 篩選（{len(verticals)} 個行業 × {len(cities)} 個城市，掃描一次）===")
    extract_mof(mof_csv, targets)
    print("=== 3/6 合併資料來源 ===")
    for v, city in targets:
        cmd_import(ns(csv=mof_source_path(v, city), area=city, vertical=v))
        for extra in sorted((ROOT / "seeds").glob(f"{v}_{city}_*.csv")):  # 人工 / 網路補充（可選）
            print(f"  + {extra.name}")
            cmd_import(ns(csv=extra, area=city, vertical=v))
    print("=== 4/6 地址定位（有快取，只查新地址）===")
    cmd_geocode(ns(force=False))
    if os.environ.get("IG_ACCESS_TOKEN") and os.environ.get("IG_USER_ID"):
        print("=== 4b IG 作品 ===")
        cmd_ig(ns(media=12))
    print("=== 5/6 報告與 SQL ===")
    cmd_report(ns())
    cmd_sql(ns())
    print("=== 6/6 產生網站 ===")
    counts = {(v, c): cmd_site(ns(vertical=v, city=c)) for v, c in targets}
    write_home(counts)


# ================================================================ main

def main() -> None:
    load_env()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("import", help="匯入 CSV（格式見 seeds/merchants_template.csv）")
    p.add_argument("csv")
    p.add_argument("--vertical", required=True, help="config/verticals.json 的行業，例：nail")
    p.add_argument("--area", help="城市（地址缺漏時用）")
    p.set_defaults(func=cmd_import)

    p = sub.add_parser("mof", help=f"從財政部稅籍登記 CSV 篩出店家（下載：{MOF_URL}）")
    p.add_argument("csv", help="解壓後的 BGMOPEN1.csv")
    p.add_argument("--vertical", required=True, help="例：nail")
    p.add_argument("--city", required=True, nargs="+", help="例：竹北市 大安區")
    p.set_defaults(func=cmd_mof)

    p = sub.add_parser("geocode", help="Nominatim 免費定位")
    p.add_argument("--force", action="store_true", help="全部重新定位")
    p.set_defaults(func=cmd_geocode)

    p = sub.add_parser("ig", help="IG Business Discovery 補作品（選用）")
    p.add_argument("--media", type=int, default=12)
    p.set_defaults(func=cmd_ig)

    sub.add_parser("report").set_defaults(func=cmd_report)
    sub.add_parser("sql").set_defaults(func=cmd_sql)
    p = sub.add_parser("site", help="產生網頁（data/public/<行業>/<城市>/index.html）")
    p.add_argument("--vertical", required=True)
    p.add_argument("--city", required=True)
    p.set_defaults(func=cmd_site)

    p = sub.add_parser("build", help="全自動：下載政府資料 → 篩選 → 合併 → 定位 → 報告 → SQL → 網站")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--city", nargs="+", help="一或多個城市，例：竹北市 大安區")
    g.add_argument("--all", action="store_true", help="所有行業 × 所有城市")
    p.add_argument("--vertical", nargs="+", help="行業（預設全部），例：nail")
    p.add_argument("--refresh", action="store_true", help="強制重新下載政府資料")
    p.set_defaults(func=cmd_build)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
