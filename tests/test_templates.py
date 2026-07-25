from datetime import datetime

from services.templates import render_template


def test_render_template_variables():
    result = render_template(
        "Hello {group_name} on {date} at {time}",
        "Operators",
        datetime(2026, 6, 14, 9, 30),
    )
    assert result == "Hello Operators on 2026-06-14 at 09:30"
