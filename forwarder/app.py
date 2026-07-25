from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Ensure repo root is importable when launched via `streamlit run forwarder/app.py`
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import streamlit as st

from forwarder.config import get_settings
from forwarder.discord_service import DiscordService
from forwarder.storage import Storage
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
    selected = store.get_selected_targets()

    c1, c2 = st.columns(2)
    with c1:
        st.subheader("Telegram groups")
        if st.button("Refresh Telegram"):
            try:
                with st.spinner("Loading Telegram dialogs..."):
                    tg_list = _run(tg.list_groups())
                st.session_state["tg_targets"] = [
                    {"id": t.id, "name": f"{t.name} [{t.kind}]", "raw_name": t.name}
                    for t in tg_list
                ]
            except Exception as exc:
                st.error(str(exc))
        tg_targets = st.session_state.get("tg_targets", [])
        if tg_targets:
            labels = {t["id"]: t["name"] for t in tg_targets}
            default = [i for i in selected["telegram"] if i in labels]
            picked_tg = st.multiselect(
                "Select Telegram targets",
                options=list(labels.keys()),
                default=default,
                format_func=lambda i: labels.get(i, i),
            )
        else:
            picked_tg = selected["telegram"]
            st.info("Click Refresh Telegram to load groups.")

    with c2:
        st.subheader("Discord channels")
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

    if st.button("Save selection", type="primary"):
        store.set_selected_targets(picked_tg, picked_dc)
        st.success(
            f"Saved {len(picked_tg)} Telegram + {len(picked_dc)} Discord target(s)."
        )


def page_compose(settings, tg: TelegramService, dc: DiscordService, store: Storage) -> None:
    st.header("Compose & broadcast")
    selected = store.get_selected_targets()
    total = len(selected["telegram"]) + len(selected["discord"])
    st.write(f"Selected targets: **{total}** (max {settings.max_targets_per_run} per run)")

    message = st.text_area(
        "Message",
        value=store.get_draft_message(),
        height=200,
        placeholder="Your marketing message…",
    )
    delay = st.slider(
        "Delay between sends (seconds)",
        min_value=3.0,
        max_value=30.0,
        value=float(settings.default_delay_seconds),
        step=1.0,
    )
    raise_cap = st.checkbox(
        "Allow more than the default max targets (use carefully)", value=False
    )
    max_targets = (
        settings.max_targets_per_run
        if not raise_cap
        else max(settings.max_targets_per_run, total)
    )

    if st.button("Save draft"):
        store.set_draft_message(message)
        st.success("Draft saved")

    if st.button("Broadcast", type="primary", disabled=not message.strip() or total == 0):
        store.set_draft_message(message)
        tg_names = {
            t["id"]: t.get("raw_name", t["name"])
            for t in st.session_state.get("tg_targets", [])
        }
        dc_names = {
            t["id"]: t.get("raw_name", t["name"])
            for t in st.session_state.get("dc_targets", [])
        }

        progress = st.progress(0.0, text="Starting…")
        all_results = []

        tg_ids = selected["telegram"][:max_targets]
        remaining = max_targets - len(tg_ids)
        dc_ids = selected["discord"][: max(0, remaining)]

        steps = len(tg_ids) + len(dc_ids) or 1
        done = 0

        if tg_ids:
            progress.progress(done / steps, text="Sending Telegram…")
            try:
                results = _run(
                    tg.broadcast(message, tg_ids, delay, max_targets, tg_names)
                )
                for r in results:
                    store.add_send_log(
                        "telegram", r.target_id, r.target_name, r.status, r.detail
                    )
                    all_results.append(("telegram", r))
                    done += 1
                    progress.progress(
                        min(done / steps, 1.0), text=f"Telegram: {r.target_name}"
                    )
            except Exception as exc:
                st.error(f"Telegram broadcast failed: {exc}")

        if dc_ids:
            progress.progress(done / steps, text="Sending Discord…")
            try:
                results = _run(
                    dc.broadcast(message, dc_ids, delay, max_targets, dc_names)
                )
                for r in results:
                    store.add_send_log(
                        "discord", r.target_id, r.target_name, r.status, r.detail
                    )
                    all_results.append(("discord", r))
                    done += 1
                    progress.progress(
                        min(done / steps, 1.0), text=f"Discord: {r.target_name}"
                    )
            except Exception as exc:
                st.error(f"Discord broadcast failed: {exc}")

        progress.progress(1.0, text="Done")
        ok = sum(1 for _, r in all_results if r.status == "ok")
        st.success(f"Finished: {ok}/{len(all_results)} sent successfully")
        st.dataframe(
            [
                {
                    "platform": platform,
                    "target": r.target_name,
                    "status": r.status,
                    "detail": r.detail,
                }
                for platform, r in all_results
            ],
            use_container_width=True,
        )


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

    if not _gate(settings.owner_password):
        return

    st.sidebar.title("Group Forwarder")
    page = st.sidebar.radio("Page", ["Connect", "Targets", "Compose", "Log"])
    st.sidebar.caption(
        "Only post in groups/servers where you have permission. "
        "Mass spam can get accounts banned."
    )
    st.sidebar.caption(f"Data: {settings.db_path}")

    if page == "Connect":
        page_connect(settings, tg, dc)
    elif page == "Targets":
        page_targets(settings, tg, dc, store)
    elif page == "Compose":
        page_compose(settings, tg, dc, store)
    else:
        page_log(store)


main()
