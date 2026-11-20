"""從 brand/ 產生網站用的素材到 apps/web/public/（品牌改了就重跑一次）。

    python brand/build_assets.py      # 需要 Pillow
"""

from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

BRAND = Path(__file__).resolve().parent
PUBLIC = BRAND.parent / "apps" / "web" / "public"


def main() -> None:
    icons = PUBLIC / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(BRAND / "app-icon.svg", icons / "icon.svg")
    shutil.copyfile(BRAND / "logo-pin.svg", icons / "logo-pin.svg")

    src = Image.open(BRAND / "source" / "app-icon.jpg").convert("RGB")
    for size in (180, 192, 512):
        name = "apple-touch-icon.png" if size == 180 else f"icon-{size}.png"
        src.resize((size, size), Image.Resampling.LANCZOS).save(icons / name, optimize=True)

    hero = Image.open(BRAND / "source" / "banner-hero.jpg").convert("RGB")
    w, h = hero.size
    photo = hero.crop((w // 2, 0, w, h))  # 右半邊：騎樓街景照片
    photo.thumbnail((900, 900), Image.Resampling.LANCZOS)
    photo.save(PUBLIC / "hero.webp", quality=72, method=6)

    og = hero.copy()
    og.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    og.save(PUBLIC / "og.jpg", quality=80, optimize=True)  # 分享到 LINE / FB 時的預覽圖

    for p in sorted(PUBLIC.rglob("*")):
        if p.is_file():
            print(f"{p.stat().st_size:>8}  {p.relative_to(PUBLIC)}")


if __name__ == "__main__":
    main()
