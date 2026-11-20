from datetime import date

import pytest

from onenago_etl.normalize.text import guess_kind, ig_handle, roc_date


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("@Shop_Nail", "shop_nail"),
        ("https://www.instagram.com/sara_we_sara/", "sara_we_sara"),
        ("https://instagram.com/hsien_nail2019?igshid=abc", "hsien_nail2019"),
        ("https://www.instagram.com/p/ABC123/", ""),
        ("", ""),
    ],
)
def test_ig_handle(raw: str, expected: str) -> None:
    assert ig_handle(raw) == expected


def test_roc_date() -> None:
    assert roc_date("1110329") == date(2022, 3, 29)
    assert roc_date("0980901") == date(2009, 9, 1)
    assert roc_date("1111399") is None
    assert roc_date("") is None


def test_guess_kind() -> None:
    assert guess_kind("小妤三美甲工作室") == "studio"
    assert guess_kind("露西美甲店") == "shop"
