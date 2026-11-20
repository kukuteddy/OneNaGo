import pytest

from onenago_etl.config import City
from onenago_etl.normalize import address as addr

ZHUBEI = City("zhubei", "竹北市", "新竹縣")
DAAN = City("taipei-daan", "大安區", "臺北市")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("302新竹縣竹北市勝利五路178號", "新竹縣竹北市勝利五路178號"),  # 郵遞區號
        ("台北市大安區忠孝東路四段1號", "臺北市大安區忠孝東路四段1號"),  # 台 → 臺
        ("新竹縣竹北市縣政九路28巷3―1號1樓", "新竹縣竹北市縣政九路28巷3之1號1樓"),  # 全形連字號
        ("新竹縣竹北市新國里002鄰新光街31巷13號", "新竹縣竹北市新國里2鄰新光街31巷13號"),
        ("新竹縣竹北市三民路１３６號", "新竹縣竹北市三民路136號"),  # 全形數字
    ],
)
def test_normalize(raw: str, expected: str) -> None:
    assert addr.normalize(raw) == expected


@pytest.mark.parametrize(
    ("raw", "road", "lane", "number"),
    [
        ("新竹縣竹北市勝利五路178號", "勝利五路", "", "178號"),
        ("臺北市大安區忠孝東路四段216巷27弄1之2號3樓", "忠孝東路四段", "216巷27弄", "1之2號"),
        ("新竹縣竹北市北興里十興路1段331號", "十興路1段", "", "331號"),  # 里 + 阿拉伯數字段
        ("新竹縣竹北市光明六路東二段116號", "光明六路東二段", "", "116號"),  # 方向 + 段
        ("臺中市西屯區台灣大道三段99號", "台灣大道三段", "", "99號"),
    ],
)
def test_parse(raw: str, road: str, lane: str, number: str) -> None:
    p = addr.parse(addr.normalize(raw))
    assert p is not None
    assert (p.road, p.lane, p.number) == (road, lane, number)


@pytest.mark.parametrize(
    ("a", "b"),
    [
        ("302新竹縣竹北市十興路一段331號", "新竹縣竹北市北興里十興路1段331號"),
        ("新竹縣竹北市勝利8街2段103號", "新竹縣竹北市勝利八街二段103號"),
        ("新竹縣竹北市光明六路東2段252號1樓", "新竹縣竹北市光明六路東二段252號"),
        ("新竹縣竹北市勝利十二街91號", "新竹縣竹北市勝利12街91號"),
    ],
)
def test_match_key_same_place(a: str, b: str) -> None:
    ka, kb = addr.match_key(addr.normalize(a)), addr.match_key(addr.normalize(b))
    assert ka and ka == kb


def test_match_key_keeps_tens_in_place_names() -> None:
    # 「十興」是地名，不是數字
    assert addr.match_key("新竹縣竹北市十興三街113號").startswith("十興3街")


def test_match_key_needs_house_number() -> None:
    assert addr.match_key("新竹縣竹北市勝利五路") == ""


def test_in_city_checks_county() -> None:
    assert addr.in_city("臺北市大安區新生南路二段1號", DAAN)
    assert addr.in_city("台北市大安區新生南路二段1號", DAAN)
    assert not addr.in_city("臺中市大安區中山南路1號", DAAN)  # 同名行政區
    assert addr.in_city("新竹縣竹北市勝利五路178號", ZHUBEI)
    assert not addr.in_city("新竹市東區光復路1號", ZHUBEI)
