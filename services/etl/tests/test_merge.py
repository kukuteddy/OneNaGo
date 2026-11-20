from datetime import date

from onenago_etl.merge import MerchantIndex
from onenago_etl.models import Record


def gov(name: str, address: str, tax_id: str, **kw: object) -> Record:
    return Record(
        name=name, address=address, source="gov_open_data", tax_id=tax_id, registered_name=name, **kw
    )  # type: ignore[arg-type]


def web(name: str, address: str, **kw: object) -> Record:
    return Record(name=name, address=address, source="manual", **kw)  # type: ignore[arg-type]


def test_gov_then_web_same_address_merges_and_keeps_sign_name() -> None:
    idx = MerchantIndex()
    m, created = idx.add(
        gov(
            "沙菈美甲沙龍工作室",
            "新竹縣竹北市十興里勝利五路178號1樓",
            "12345678",
            established=date(2009, 9, 1),
        ),
        vertical="nail",
        city="zhubei",
    )
    assert created
    m2, created2 = idx.add(
        web("沙菈美學SARA's", "新竹縣竹北市勝利五路178號", ig="sara_we_sara"), vertical="nail", city="zhubei"
    )
    assert not created2 and m2 is m
    assert m.name == "沙菈美學SARA's"  # 招牌名稱優先
    assert m.registered_name == "沙菈美甲沙龍工作室"
    assert m.ig == "sara_we_sara" and m.ig_source == "manual"
    assert m.sources == {"gov_open_data", "manual"}
    assert m.established == date(2009, 9, 1)


def test_gov_name_does_not_override_web_name() -> None:
    idx = MerchantIndex()
    idx.add(web("NICA Beauty 尼卡美學", "新竹縣竹北市十興路一段331號"), vertical="nail", city="zhubei")
    m, created = idx.add(
        gov("尼卡美學", "新竹縣竹北市北興里十興路1段331號", "87654321"), vertical="nail", city="zhubei"
    )
    assert not created
    assert m.name == "NICA Beauty 尼卡美學"
    assert m.tax_id == "87654321"


def test_same_address_different_tax_id_are_different_shops() -> None:
    idx = MerchantIndex()
    idx.add(gov("煦妍美學", "新竹縣竹北市中正西路166號", "11111111"), vertical="nail", city="zhubei")
    _, created = idx.add(
        gov("易緹美學", "新竹縣竹北市中正西路166號1樓", "22222222"), vertical="nail", city="zhubei"
    )
    assert created
    assert len(idx) == 2


def test_same_tax_id_merges_across_verticals() -> None:
    idx = MerchantIndex()
    m, _ = idx.add(gov("喬在這裡沙龍", "新竹縣竹北市新興路23號", "33333333"), vertical="nail", city="zhubei")
    m2, created = idx.add(
        gov("喬在這裡沙龍", "新竹縣竹北市新興路23號", "33333333"), vertical="hair", city="zhubei"
    )
    assert not created and m2 is m
    assert m.verticals == {"nail", "hair"}


def test_ids_are_stable_across_runs() -> None:
    a, _ = MerchantIndex().add(gov("店", "新竹縣竹北市三民路1號", "44444444"), vertical="nail", city="zhubei")
    b, _ = MerchantIndex().add(gov("店", "新竹縣竹北市三民路1號", "44444444"), vertical="nail", city="zhubei")
    assert a.id == b.id and len(a.short_id) == 8
