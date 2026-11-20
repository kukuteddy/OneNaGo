from onenago_etl.enrich.ig_search import Candidate, candidates, score
from onenago_etl.models import Merchant

SHOP = Merchant(
    id="x",
    city_slug="zhubei",
    name="沙菈美學SARA's",
    registered_name="沙菈美甲沙龍工作室",
    address="新竹縣竹北市十興里勝利五路178號1樓",
    phone="03-658-8252",
)


def test_candidates_from_profile_url_and_title() -> None:
    res = [
        {
            "url": "https://www.instagram.com/sara_we_sara/",
            "title": "沙菈美學 (@sara_we_sara)",
            "content": "",
        },
        {"url": "https://www.instagram.com/p/ABC/", "title": "台北美甲 (@other_nail) on Instagram"},
        {"url": "https://www.instagram.com/explore/tags/nail/", "title": "#nail"},
    ]
    assert [c.handle for c in candidates(res)] == ["sara_we_sara", "other_nail"]


def test_accepts_when_name_and_location_match() -> None:
    c = Candidate("sara_we_sara", "沙菈美學 SARA's (@sara_we_sara)", "沙菈美學 竹北美甲 勝利五路178號")
    s, reasons = score(SHOP, "竹北市", c)
    assert s >= 0.5
    assert any("店名" in r for r in reasons)


def test_rejects_name_only() -> None:
    c = Candidate("x", "沙菈美學 (@x)", "沙菈美學 日常分享")
    assert score(SHOP, "竹北市", c)[0] == 0


def test_rejects_location_only() -> None:
    c = Candidate("y", "隨便的店 (@y)", "隨便的店 竹北市")
    assert score(SHOP, "竹北市", c)[0] == 0


def test_phone_counts_as_location() -> None:
    c = Candidate("z", "沙菈美學 (@z)", "沙菈美學 預約 03-6588252")
    assert score(SHOP, "竹北市", c)[0] >= 0.5
