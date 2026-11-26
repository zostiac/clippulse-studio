import pytest

from mediautil import parse_byte_range, safe_join


def test_full_and_open_ended_ranges():
    assert parse_byte_range("bytes=0-99", 1000) == (0, 99)
    assert parse_byte_range("bytes=500-", 1000) == (500, 999)
    assert parse_byte_range("bytes=900-5000", 1000) == (900, 999)


def test_suffix_range_means_last_n_bytes():
    assert parse_byte_range("bytes=-100", 1000) == (900, 999)
    assert parse_byte_range("bytes=-5000", 1000) == (0, 999)


def test_ignored_headers_serve_whole_file():
    assert parse_byte_range("items=0-1", 1000) is None
    assert parse_byte_range("bytes=0-1,5-6", 1000) is None


@pytest.mark.parametrize("header", ["bytes=abc-def", "bytes=2000-3000", "bytes=-0", "bytes=500", "bytes=9-1"])
def test_bad_ranges_raise(header):
    with pytest.raises(ValueError):
        parse_byte_range(header, 1000)


def test_safe_join_stays_inside_base(tmp_path):
    base = tmp_path / "projects"
    base.mkdir()
    assert safe_join(base, "proj_1234abcd", "source.mp4") == (base / "proj_1234abcd" / "source.mp4").resolve()
    # separators are dropped from every part, so nothing can climb out
    assert safe_join(base, "../../etc", "passwd") == (base / "etc" / "passwd").resolve()


def test_safe_join_rejects_dotdot_component(tmp_path):
    base = tmp_path / "projects"
    base.mkdir()
    with pytest.raises(PermissionError):
        safe_join(base, "..", "settings.json")
