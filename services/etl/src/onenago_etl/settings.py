"""路徑與環境變數。"""

from __future__ import annotations

import os
from pathlib import Path

ETL_DIR = Path(__file__).resolve().parents[2]  # services/etl
REPO_ROOT = ETL_DIR.parents[1]
CONFIG_DIR = REPO_ROOT / "config"
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"
CACHE_DIR = ETL_DIR / "cache"  # 版控：定位、IG 比對結果
RAW_DIR = CACHE_DIR / "mof"  # 不版控：政府原始檔（約 300MB）
SEEDS_DIR = ETL_DIR / "seeds"
WORK_DIR = ETL_DIR / ".work"  # 不版控：每次執行的中間產物

USER_AGENT = "OneNaGo/0.2 (+https://github.com/kukuteddy/OneNaGo)"


def load_dotenv(path: Path = ETL_DIR / ".env") -> None:
    """讀取 services/etl/.env（KEY=VALUE），不覆蓋已存在的環境變數。"""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def env(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None
