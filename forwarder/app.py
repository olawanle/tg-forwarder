from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

# Ensure repo root is importable when launched via `streamlit run forwarder/app.py`
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import streamlit as st

from forwarder.config import get_settings
from forwarder.discord_service import DiscordService
from forwarder.job_runner import get_job_runner
from forwarder.storage import JobRow, Storage
from forwarder.telegram_service import TelegramService


def _run(coro):
    return asyncio.run(coro)


def _gate(password: str) -> bool:
    if not password:
        return True
    if st.session_state.get("authed"):
        return True
    st.title("Group Forwarder")
    entered = st.text_input("Owner password", type="password")
    if st.button("Unlock"):
        if entered == password:
            st.session_state["authed"] = True
            st.rerun()
        st.error("Wrong password")
    return False


def _services():
    settings = get_settings()
    tg_session = st.session_state.get("telegram_session") or settings.telegram_session
    tg = TelegramService(settings.telegram_api_id, settings.telegram_api_hash, tg_session)
    dc = DiscordService(settings.discord_bot_token)
    store = Storage(settings.db_path)
    return settings, tg, dc, store


def page_connect(settings, tg: TelegramService, dc: DiscordService) -> None:
    st.header("Connect")
    st.caption(
        "Telegram uses your personal account (Telethon). "
        "Discord uses a bot invited to each server."
    )

    col1, col2 = st.columns(2)
    with col1:
        st.subheader("Telegram")
        if not tg.configured():
            st.warning("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in the environment.")
        else:
            status = _run(tg.status())
            if status["ok"]:
                st.success(status["detail"])
            else:
                st.info(status["detail"])

            with st.expander("Login / refresh session", expanded=not tg.has_session()):
                phone = st.text_input("Phone (+countrycode...)", key="tg_phone")
                if st.button("Send login code"):
                    try:
                        phone_code_hash, session = _run(tg.request_code(phone.strip()))
                        st.session_state["telegram_session"] = session
                        st.session_state["tg_phone"] = phone.strip()
                        st.session_state["tg_phone_code_hash"] = phone_code_hash
                        st.success("Code requested. Check Telegram.")
                    except Exception as exc:
                        st.error(str(exc))

                code = st.text_input("Login code", key="tg_code")
                password = st.text_input("2FA password (if any)", type="password", key="tg_2fa")
                if st.button("Complete login"):
                    try:
                        if st.session_state.get("telegram_session"):
                            tg.session = st.session_state["telegram_session"]
                        phone_val = st.session_state.get("tg_phone") or phone.strip()
                        phone_code_hash = st.session_state.get("tg_phone_code_hash")
                        if not phone_code_hash:
                            raise RuntimeError("Request a login code first")
                        session = _run(
                            tg.complete_login(
                                phone_val,
                                code.strip(),
                                phone_code_hash,
                                password.strip() or None,
                            )
                        )
                        st.session_state["telegram_session"] = session
                        st.success("Logged in. Copy the session into TELEGRAM_SESSION for Railway.")
                        st.code(session, language="text")
                    except Exception as exc:
                        st.error(str(exc))

            existing = st.text_area(
                "Or paste an existing TELEGRAM_SESSION",
                value=st.session_state.get("telegram_session") or settings.telegram_session,
                height=80,
            )
            if st.button("Use pasted session"):
                st.session_state["telegram_session"] = existing.strip()
                st.success("Session stored for this browser session.")
                st.rerun()

    with col2:
        st.subheader("Discord")
        if not dc.configured():
            st.warning("Set DISCORD_BOT_TOKEN in the environment.")
        else:
            with st.spinner("Checking Discord bot..."):
                status = _run(dc.status())
            if status["ok"]:
                st.success(f"{status['detail']} — {status['guilds']} server(s)")
            else:
                st.error(status["detail"])
            st.markdown(
                "Invite the bot with **Send Messages** permission into each marketing server. "
                "Use the Discord Developer Portal OAuth2 URL generator (`bot` scope)."
            )


def page_targets(settings, tg: TelegramService, dc: DiscordService, store: Storage) -> None:
    st.header("Targets")
    st.caption(
        "Telegram: every group/supergroup on the account is messaged on Broadcast "
        "(DMs and broadcast channels are ignored). Auto-deleted and Stars-gated groups "
        "are blacklisted and skipped on later runs."
    )

    skips = store.get_telegram_skips()
    c1, c2 = st.columns(2)
    with c1:
        st.subheader("Telegram")
        if st.button("Preview all Telegram groups"):
            try:
                with st.spinner("Loading groups…"):
                    tg_list = _run(tg.list_groups(skip_ids=set(skips.keys())))
                st.session_state["tg_targets"] = [
                    {
                        "id": t.id,
                        "name": f"{t.name} [{t.kind}]",
                        "raw_name": t.name,
                        "stars": t.stars_required,
                    }
                    for t in tg_list
                ]
            except Exception as exc:
                st.error(str(exc))
        tg_targets = st.session_state.get("tg_targets", [])
        if tg_targets:
            st.write(f"**{len(tg_targets)}** groups will be messaged (excluding blacklist).")
            st.dataframe(
                [
                    {
                        "name": t["raw_name"],
                        "kind": t["name"].split("[")[-1].rstrip("]") if "[" in t["name"] else "",
                        "stars": t.get("stars", 0),
                    }
                    for t in tg_targets
                ],
                use_container_width=True,
                height=280,
            )
        else:
            st.info("Click Preview to see every group on the account.")

        st.subheader("Blacklisted Telegram groups")
        if skips:
            st.dataframe(
                [
                    {
                        "name": v.get("name", k),
                        "reason": v.get("reason", ""),
                        "detail": v.get("detail", ""),
                        "at": v.get("at", ""),
                    }
                    for k, v in skips.items()
                ],
                use_container_width=True,
                height=220,
            )
            restore_id = st.selectbox(
                "Restore a group from blacklist",
                options=[""] + list(skips.keys()),
                format_func=lambda i: "(pick…)" if not i else skips[i].get("name", i),
            )
            cols = st.columns(2)
            if cols[0].button("Restore selected") and restore_id:
                store.remove_telegram_skip(restore_id)
                st.success("Restored — will be included on next broadcast.")
                st.rerun()
            if cols[1].button("Clear entire blacklist"):
                store.clear_telegram_skips()
                st.success("Blacklist cleared.")
                st.rerun()
        else:
            st.caption("No blacklisted groups yet.")

    with c2:
        st.subheader("Discord channels (optional)")
        selected = store.get_selected_targets()
        if st.button("Refresh Discord"):
            try:
                with st.spinner("Loading Discord channels..."):
                    dc_list = _run(dc.list_text_channels())
                st.session_state["dc_targets"] = [
                    {"id": t.id, "name": t.name, "raw_name": t.name}
                    for t in dc_list
                ]
            except Exception as exc:
                st.error(str(exc))
        dc_targets = st.session_state.get("dc_targets", [])
        if dc_targets:
            labels = {t["id"]: t["name"] for t in dc_targets}
            default = [i for i in selected["discord"] if i in labels]
            picked_dc = st.multiselect(
                "Select Discord channels",
                options=list(labels.keys()),
                default=default,
                format_func=lambda i: labels.get(i, i),
            )
        else:
            picked_dc = selected["discord"]
            st.info("Click Refresh Discord to load channels the bot can post in.")

        if st.button("Save Discord selection", type="primary"):
            store.set_selected_targets([], picked_dc)
            st.success(f"Saved {len(picked_dc)} Discord channel(s).")


def _render_job_panel(store: Storage, job: JobRow, runner) -> None:
    total = max(job.total, 1)
    frac = min(job.done / total, 1.0) if job.total else 0.0
    if job.status in {"completed", "failed", "cancelled"}:
        frac = 1.0

    st.progress(
        frac,
        text=f"Job #{job.id} · {job.status} · {job.done}/{job.total or '?'} · {job.current_name or '—'}",
    )
    st.caption(job.current_detail or "")
    if job.error:
        st.error(job.error)

    if job.status in {"queued", "running", "interrupted"}:
        cols = st.columns(2)
        if cols[0].button("Cancel broadcast", key=f"cancel_{job.id}"):
            runner.request_cancel()
            store.update_job(job.id, current_detail="Cancel requested…")
            st.warning("Cancel requested — finishes the current group, then stops.")
        if job.status == "interrupted" and cols[1].button(
            "Resume now", key=f"resume_{job.id}"
        ):
            settings = get_settings()
            session = st.session_state.get("telegram_session") or settings.telegram_session
            try:
                runner.resume_interrupted(store, session)
                st.success("Resume started")
                st.rerun()
            except Exception as exc:
                st.error(str(exc))

    if job.summary:
        st.write(
            f"Summary: **{job.summary.get('ok', 0)}** sent · "
            f"**{job.summary.get('auto_deleted', 0)}** auto-deleted · "
            f"**{job.summary.get('skipped_stars', 0)}** stars · "
            f"**{job.summary.get('other_skips', 0)}** other skips · "
            f"**{job.summary.get('errors', 0)}** errors"
        )

    results = store.list_job_results(job.id)
    if results:
        st.dataframe(
            [
                {
                    "platform": r.platform,
                    "target": r.target_name,
                    "status": r.status,
                    "detail": r.detail,
                }
                for r in results[-200:]
            ],
            use_container_width=True,
            height=320,
        )


def page_progress(store: Storage) -> None:
    st.header("Broadcast progress")
    st.caption(
        "Jobs run in the background on the server. You can switch pages, reload, "
        "or open this URL on another device — progress is shared from the database."
    )
    runner = get_job_runner()
    job = store.get_active_job() or store.get_latest_job()
    if not job:
        st.info("No broadcast jobs yet. Start one from Compose.")
        return

    _render_job_panel(store, job, runner)

    if job.status in {"queued", "running"}:
        st.caption("Auto-refreshing every 2 seconds…")
        time.sleep(2)
        st.rerun()


def page_compose(settings, tg: TelegramService, dc: DiscordService, store: Storage) -> None:
    st.header("Compose & broadcast")
    runner = get_job_runner()
    skips = store.get_telegram_skips()
    selected = store.get_selected_targets()
    active = store.get_active_job()

    st.info(
        "Broadcast runs as a **background job** on the server. Leaving this page, "
        "reloading, or opening another device will not stop it — watch Progress."
    )
    st.write(
        f"Blacklisted Telegram groups: **{len(skips)}** · "
        f"Discord channels selected: **{len(selected['discord'])}**"
    )

    if active:
        st.warning(
            f"Job #{active.id} is **{active.status}** "
            f"({active.done}/{active.total or '?'}). "
            "Start is disabled until it finishes or you cancel it."
        )
        _render_job_panel(store, active, runner)
        if active.status in {"queued", "running"}:
            time.sleep(2)
            st.rerun()
        return

    latest = store.get_latest_job()
    if latest and latest.status in {"completed", "failed", "cancelled", "interrupted"}:
        with st.expander(f"Last job #{latest.id} ({latest.status})", expanded=False):
            _render_job_panel(store, latest, runner)
            if latest.status == "interrupted":
                if st.button("Resume interrupted job"):
                    session = (
                        st.session_state.get("telegram_session") or settings.telegram_session
                    )
                    try:
                        runner.resume_interrupted(store, session)
                        st.rerun()
                    except Exception as exc:
                        st.error(str(exc))

    message = st.text_area(
        "Message",
        value=store.get_draft_message(),
        height=200,
        placeholder="Your marketing message…",
    )
    delay = st.slider(
        "Delay between sends (seconds)",
        min_value=3.0,
        max_value=60.0,
        value=float(settings.default_delay_seconds),
        step=1.0,
    )
    max_slowmode = st.slider(
        "Max wait for group slowmode / FloodWait (seconds)",
        min_value=30,
        max_value=1800,
        value=300,
        step=30,
        help="If a group requires a longer wait than this, it is skipped for this run only.",
    )
    include_discord = st.checkbox(
        "Also send to selected Discord channels after Telegram finishes",
        value=bool(selected["discord"]),
    )

    if st.button("Save draft"):
        store.set_draft_message(message)
        st.success("Draft saved")

    can_start = bool(message.strip() and tg.has_session())
    if st.button(
        "Start background broadcast to all Telegram groups",
        type="primary",
        disabled=not can_start,
    ):
        store.set_draft_message(message)
        session = st.session_state.get("telegram_session") or settings.telegram_session
        try:
            job_id = runner.start_broadcast(
                store=store,
                message=message,
                delay_seconds=float(delay),
                max_slowmode_wait=int(max_slowmode),
                include_discord=bool(include_discord),
                telegram_session=session,
            )
            st.success(f"Started background job #{job_id}. Open Progress anytime.")
            st.rerun()
        except Exception as exc:
            st.error(str(exc))


def page_log(store: Storage) -> None:
    st.header("Send log")
    rows = store.list_send_logs(150)
    if not rows:
        st.info("No sends yet.")
        return
    st.dataframe(
        [
            {
                "when": r.created_at,
                "platform": r.platform,
                "target": r.target_name,
                "status": r.status,
                "detail": r.detail,
            }
            for r in rows
        ],
        use_container_width=True,
    )


def main() -> None:
    st.set_page_config(page_title="Group Forwarder", page_icon="📣", layout="wide")
    settings, tg, dc, store = _services()
    runner = get_job_runner()
    session = st.session_state.get("telegram_session") or settings.telegram_session
    runner.ensure_started(store, session)

    if not _gate(settings.owner_password):
        return

    active = store.get_active_job()
    st.sidebar.title("Group Forwarder")
    if active:
        st.sidebar.success(
            f"Job #{active.id} {active.status}: {active.done}/{active.total or '?'}"
        )
    page = st.sidebar.radio(
        "Page", ["Connect", "Targets", "Compose", "Progress", "Log"]
    )
    st.sidebar.caption(
        "Only post in groups/servers where you have permission. "
        "Mass spam can get accounts banned."
    )
    st.sidebar.caption(f"Data: {settings.db_path}")
    st.sidebar.caption(
        "Note: Railway free tier sleeps the app when idle — a sleeping "
        "container pauses jobs until someone opens the site again (then it resumes)."
    )

    if page == "Connect":
        page_connect(settings, tg, dc)
    elif page == "Targets":
        page_targets(settings, tg, dc, store)
    elif page == "Compose":
        page_compose(settings, tg, dc, store)
    elif page == "Progress":
        page_progress(store)
    else:
        page_log(store)


main()
