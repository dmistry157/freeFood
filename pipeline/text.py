"""Shared text helpers."""
import html
import re


def strip_html(s: str | None) -> str:
    s = re.sub(r"<(style|script)[^>]*>.*?</\1>", " ", s or "", flags=re.I | re.S)
    s = re.sub(r"<br\s*/?>|</p>|</li>|</div>|</tr>|</h\d>", "\n", s, flags=re.I)
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    return re.sub(r"[ \t\xa0‌͏]+", " ", re.sub(r"\n\s*\n+", "\n", s)).strip()
