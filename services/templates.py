from datetime import datetime


def render_template(body: str, group_name: str, now: datetime | None = None) -> str:
    now = now or datetime.now()
    return (
        body.replace("{group_name}", group_name)
        .replace("{date}", now.strftime("%Y-%m-%d"))
        .replace("{time}", now.strftime("%H:%M"))
    )
