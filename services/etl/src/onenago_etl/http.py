"""HTTP 小工具（只用標準函式庫）。"""

from __future__ import annotations

import json
import shutil
import ssl
import urllib.error
import urllib.request
from email.utils import formatdate
from pathlib import Path
from typing import Any

from .settings import USER_AGENT


def request_json(
    url: str,
    *,
    data: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 30,
) -> Any:
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT, **(headers or {})})
    if body is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def download_if_modified(url: str, dest: Path, *, relaxed_tls: bool = False, timeout: float = 600) -> bool:
    """有更新才下載（If-Modified-Since）。回傳是否真的下載了新檔；失敗但有舊檔時沿用舊檔。"""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    if dest.exists():
        req.add_header("If-Modified-Since", formatdate(dest.stat().st_mtime, usegmt=True))
    ctx = ssl.create_default_context()
    if relaxed_tls:
        # 部分政府網站憑證缺 Subject Key Identifier，Python 3.13+ 的 X509_STRICT 會拒絕。
        # 只關掉 strict 旗標，憑證鏈與主機名稱仍照常驗證。
        ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            tmp = dest.with_suffix(dest.suffix + ".part")
            with open(tmp, "wb") as f:
                shutil.copyfileobj(r, f)
            tmp.replace(dest)
            return True
    except urllib.error.HTTPError as e:
        if e.code == 304:
            return False
        if dest.exists():
            return False
        raise
    except urllib.error.URLError:
        if dest.exists():
            return False
        raise
