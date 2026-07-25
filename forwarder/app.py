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
from forwarder.storage import Storage
from forwarder.telegram_service import SendResult, TelegramService


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


def page_compose(settings, tg: TelegramService, dc: DiscordService, store: Storage) -> None:
    st.header("Compose & broadcast")
    skips = store.get_telegram_skips()
    selected = store.get_selected_targets()
    st.info(
        "Telegram: **Broadcast once** sends to every group on the account, then stops "
        "until you press Broadcast again. Stars-gated groups are skipped. Groups that "
        "wipe your post are blacklisted. Slowmode waits up to your max below — longer "
        "waits are skipped for this run only."
    )
    st.write(
        f"Blacklisted Telegram groups: **{len(skips)}** · "
        f"Discord channels selected: **{len(selected['discord'])}**"
    )

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

    if st.button(
        "Broadcast to all Telegram groups",
        type="primary",
        disabled=not message.strip() or not tg.has_session(),
    ):
        store.set_draft_message(message)
        progress = st.progress(0.0, text="Loading Telegram groups…")
        status_box = st.empty()
        live_log = st.empty()
        all_results: list[tuple[str, object]] = []
        rows: list[dict] = []

        try:
            status_box.info("Fetching every group on the account…")
            targets = _run(tg.list_groups(skip_ids=set(skips.keys())))
            # Pre-skip stars known at list time
            pending = []
            for t in targets:
                if t.stars_required > 0:
                    from forwarder.telegram_service import SendResult

                    r = SendResult(
                        t.id,
                        t.name,
                        "skipped_stars",
                        f"requires {t.stars_required} Stars — auto-skipped",
                    )
                    store.add_send_log("telegram", r.target_id, r.target_name, r.status, r.detail)
                    store.add_telegram_skip(r.target_id, r.target_name, "stars_required", r.detail)
                    all_results.append(("telegram", r))
                    rows.append(
                        {
                            "platform": "telegram",
                            "target": r.target_name,
                            "status": r.status,
                            "detail": r.detail,
                        }
                    )
                else:
                    pending.append(t)

            total = len(pending)
            status_box.info(f"Sending to {total} groups (blacklist already excluded)…")
            if total == 0:
                progress.progress(1.0, text="No groups to send to")
            for index, target in enumerate(pending):
                progress.progress(
                    index / max(total, 1),
                    text=f"Telegram ({index + 1}/{total}): {target.name}",
                )
                status_box.write(
                    f"**Now sending:** `{target.name}`  \n"
                    f"Progress: {index}/{total} done · delay {delay:.0f}s between groups"
                )
                r = _run(
                    tg.send_to_group(
                        message,
                        target.id,
                        target.name,
                        max_slowmode_wait=int(max_slowmode),
                        verify_seconds=1.5,
                    )
                )
                store.add_send_log(
                    "telegram", r.target_id, r.target_name, r.status, r.detail
                )
                if r.status == "auto_deleted":
                    store.add_telegram_skip(
                        r.target_id, r.target_name, "auto_deleted", r.detail
                    )
                elif r.status == "skipped_stars":
                    store.add_telegram_skip(
                        r.target_id, r.target_name, "stars_required", r.detail
                    )
                elif r.status in {
                    "skipped_forbidden",
                    "skipped_banned",
                    "skipped_private",
                }:
                    store.add_telegram_skip(
                        r.target_id, r.target_name, r.status, r.detail
                    )
                all_results.append(("telegram", r))
                rows.append(
                    {
                        "platform": "telegram",
                        "target": r.target_name,
                        "status": r.status,
                        "detail": r.detail,
                    }
                )
                live_log.dataframe(rows, use_container_width=True, height=260)

                if index < total - 1 and delay > 0:
                    status_box.caption(f"Waiting {delay:.0f}s before next group…")
                    import time

                    time.sleep(delay)

            progress.progress(1.0, text="Telegram done")
        except Exception as exc:
            st.error(f"Telegram broadcast failed: {exc}")

        if include_discord and selected["discord"]:
            dc_names = {
                t["id"]: t.get("raw_name", t["name"])
                for t in st.session_state.get("dc_targets", [])
            }
            progress.progress(0.0, text="Sending Discord…")
            try:
                results = _run(
                    dc.broadcast(
                        message,
                        selected["discord"],
                        delay,
                        max(len(selected["discord"]), 1),
                        dc_names,
                    )
                )
                for r in results:
                    store.add_send_log(
                        "discord", r.target_id, r.target_name, r.status, r.detail
                    )
                    all_results.append(("discord", r))
                    rows.append(
                        {
                            "platform": "discord",
                            "target": r.target_name,
                            "status": r.status,
                            "detail": r.detail,
                        }
                    )
                    live_log.dataframe(rows, use_container_width=True, height=260)
            except Exception as exc:
                st.error(f"Discord broadcast failed: {exc}")

        progress.progress(1.0, text="Done — broadcast finished until you run it again")
        status_box.success("Broadcast finished. Press the button again only when you want another run.")
        ok = sum(1 for _, r in all_results if r.status == "ok")
        deleted = sum(1 for _, r in all_results if r.status == "auto_deleted")
        stars = sum(1 for _, r in all_results if r.status == "skipped_stars")
        other_skip = sum(
            1
            for _, r in all_results
            if str(getattr(r, "status", "")).startswith("skipped")
            and r.status != "skipped_stars"
        )
        st.success(
            f"Finished this run: {ok} sent · {deleted} auto-deleted (blacklisted) · "
            f"{stars} stars-gated · {other_skip} other skips · {len(all_results)} total"
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
