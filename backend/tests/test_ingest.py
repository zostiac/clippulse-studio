import pytest

from ingest import (
    _looks_like_bot_block,
    distribute_words,
    extract_youtube_id,
    is_valid_youtube_url,
    parse_plain_transcript,
    parse_subtitle_text,
    validate_netscape_cookies,
)


@pytest.mark.parametrize(
    "url",
    [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "http://youtube.com/watch?v=dQw4w9WgXcQ&t=10",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://m.youtube.com/shorts/dQw4w9WgXcQ",
        "https://www.youtube.com/live/dQw4w9WgXcQ",
    ],
)
def test_valid_youtube_urls(url):
    assert is_valid_youtube_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "",
        "http://internal-host:8080/?youtube.com",
        "https://evil.com/watch?v=dQw4w9WgXcQ&u=youtube.com",
        "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
        "file:///etc/passwd?youtube.com",
        "ftp://youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/@somechannel",  # no video id
        "youtube.com/watch?v=dQw4w9WgXcQ",  # no scheme
    ],
)
def test_invalid_youtube_urls(url):
    assert not is_valid_youtube_url(url)


def test_extract_youtube_id():
    assert extract_youtube_id("https://youtu.be/dQw4w9WgXcQ?si=abc") == "dQw4w9WgXcQ"
    assert extract_youtube_id("https://example.com") is None


def test_bot_detection_is_not_a_substring_match():
    assert _looks_like_bot_block("ERROR: Sign in to confirm you're not a bot")
    assert _looks_like_bot_block("Use --cookies-from-browser or --cookies for the authentication")
    # "both" / "robot" contain "bot" but are ordinary words
    assert not _looks_like_bot_block("Video unavailable in both regions")
    assert not _looks_like_bot_block("Requested format is not available (robotics channel)")


TAB = "\t"


def _cookie(domain=".youtube.com", name="SID", value="abc"):
    return TAB.join([domain, "TRUE", "/", "TRUE", "1999999999", name, value])


def test_cookie_validation_accepts_real_exports():
    text = "# Netscape HTTP Cookie File\n" + _cookie() + "\n" + "#HttpOnly_" + _cookie(name="HSID") + "\n"
    assert validate_netscape_cookies(text)


def test_cookie_with_empty_value_is_valid():
    # Trailing tab (empty value) used to be eaten by .strip() and rejected
    assert validate_netscape_cookies(_cookie(value="") + "\n")


@pytest.mark.parametrize("text", ["", "# only a comment\n", "not\ta\tcookie\n", _cookie(domain="") + "\n"])
def test_cookie_validation_rejects_garbage(text):
    assert not validate_netscape_cookies(text)


SRT = """1
00:00:01,000 --> 00:00:03,500
Hello there, welcome.

2
00:00:04,000 --> 00:00:06,000
This is the second line.
"""

VTT = """WEBVTT

00:00:01.000 --> 00:00:03.000
First cue

00:01:04.000 --> 00:01:06.250
Second cue
"""


def test_parse_srt():
    segs = parse_subtitle_text(SRT)
    assert [s.text for s in segs] == ["Hello there, welcome.", "This is the second line."]
    assert segs[0].start == 1.0 and segs[0].end == 3.5
    assert segs[0].words and segs[0].words[0].word == "Hello"


def test_parse_vtt_with_minutes():
    segs = parse_subtitle_text(VTT)
    assert len(segs) == 2
    assert segs[1].start == 64.0 and segs[1].end == 66.25


def test_parse_subtitle_empty_and_garbage():
    assert parse_subtitle_text("") == []
    assert parse_subtitle_text("just some words with no timing") == []


def test_distribute_words_covers_range_in_order():
    words = distribute_words("one two three four", 10.0, 14.0)
    assert [w.word for w in words] == ["one", "two", "three", "four"]
    assert words[0].start == 10.0 and words[-1].end == pytest.approx(14.0, abs=0.01)
    assert all(a.end <= b.start + 1e-6 for a, b in zip(words, words[1:]))
    assert distribute_words("   ", 0, 1) == []


def test_plain_transcript_has_no_zero_length_segments():
    text = " ".join(f"Short {i}." for i in range(40))  # many tiny sentences, short video
    segs = parse_plain_transcript(text, duration=20.0)
    assert len(segs) == 40
    assert all(s.end > s.start for s in segs)
    assert all(a.end <= b.start + 1e-6 for a, b in zip(segs, segs[1:]))
