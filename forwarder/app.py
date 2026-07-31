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

from forwarder.admin import page_admin
from forwarder.auth import authenticate, bootstrap_admin, hash_password
from forwarder.config import get_settings
from forwarder.discord_service import DiscordService
from forwarder.job_runner import get_job_runner
from forwarder.storage import JobRow, ProfileRow, Storage
from forwarder.telegram_service import TelegramService


def _run(coro):
    return asyncio.run(coro)


def _login_page(store: Storage) -> None:
    st.title("Group Forwarder")
    st.caption("Log in with the account your admin created for you. New accounts are added by the admin, not self-registration.")
    email = st.text_input("Email")
    password = st.text_input("Password", type="password")
    if st.button("Log in", type="primary"):
        user = authenticate(store, email, password)
        if user:
            st.session_state["user_id"] = user.id
            st.session_state["role"] = user.role
            st.session_state["user_email"] = user.email
            st.session_state["must_change_password"] = user.must_change_password
            st.rerun()
        else:
            st.error("Invalid email or password, or the account is disabled.")


def _change_password_page(store: Storage) -> None:
    st.title("Set a new password")
    st.caption("Your admin created this account with a temporary password. Choose a new one to continue.")
    new_pw = st.text_input("New password", type="password")
    confirm_pw = st.text_input("Confirm new password", type="password")
    if st.button("Update password", type="primary"):
        if len(new_pw) < 8:
            st.error("Password must be at least 8 characters.")
        elif new_pw != confirm_pw:
            st.error("Passwords do not match.")
        else:
            store.set_user_password(
                st.session_state["user_id"], hash_password(new_pw), must_change_password=False
            )
            st.session_state["must_change_password"] = False
            st.success("Password updated.")
            st.rerun()


def _require_auth(store: Storage) -> bool:
    if not st.session_state.get("user_id"):
        _login_page(store)
        return False
    if st.session_state.get("must_change_password"):
        _change_password_page(store)
        return False
    return True


def _profiles_for_current_user(store: Storage) -> list[ProfileRow]:
    return store.list_profiles_for_user(st.session_state["user_id"])


def _ensure_active_profile(store: Storage) -> ProfileRow | None:
    profiles = _profiles_for_current_user(store)
    if not profiles:
        st.session_state["active_profile_id"] = None
        return None
    active_id = st.session_state.get("active_profile_id")
    match = next((p for p in profiles if p.id == active_id), None)
    if match:
        return match
    chosen = profiles[-1]
    st.session_state["active_profile_id"] = chosen.id
    return chosen


def _telegram_service(settings, profile: ProfileRow) -> TelegramService:
    api_id = profile.telegram_api_id or settings.telegram_api_id
    api_hash = profile.telegram_api_hash or settings.telegram_api_hash
    return TelegramService(api_id, api_hash, profile.telegram_session)


_LOGIN_WIZARD_KEYS = (
    "login_wiz_stage",
    "login_wiz_label",
    "login_wiz_phone",
    "login_wiz_session",
    "login_wiz_hash",
)


def _reset_login_wizard() -> None:
    for key in _LOGIN_WIZARD_KEYS:
        st.session_state.pop(key, None)


def _phone_login_wizard(settings, store: Storage) -> None:
    """Log in with a phone number + code, the same way Telegram itself logs in
    a new device — works from a single mobile browser, no local script needed.

    Each step reconnects using the exact session string the previous step
    returned (not a fresh one) because Telegram ties the sent code, and later
    the 2FA check, to the specific (still-unauthorized) session that requested
    it. Persisting that string in st.session_state across Streamlit reruns is
    what makes this reliable instead of losing the login mid-flow.
    """
    if not settings.telegram_api_id or not settings.telegram_api_hash:
        st.warning("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in the environment.")
        return

    stage = st.session_state.get("login_wiz_stage", "phone")

    if stage == "phone":
        label = st.text_input(
            "Profile name (e.g. \"My main account\")", key="login_wiz_label_input"
        )
        phone = st.text_input(
            "Phone number with country code (e.g. +15551234567)",
            key="login_wiz_phone_input",
        )
        if st.button("Send login code", type="primary"):
            if not label.strip() or not phone.strip():
                st.error("Enter both a profile name and a phone number.")
            else:
                try:
                    tmp = TelegramService(settings.telegram_api_id, settings.telegram_api_hash, "")
                    phone_code_hash, session = _run(tmp.request_code(phone.strip()))
                    st.session_state["login_wiz_stage"] = "code"
                    st.session_state["login_wiz_label"] = label.strip()
                    st.session_state["login_wiz_phone"] = phone.strip()
                    st.session_state["login_wiz_session"] = session
                    st.session_state["login_wiz_hash"] = phone_code_hash
                    st.rerun()
                except Exception as exc:
                    st.error(f"Could not send a code: {exc}")

    elif stage == "code":
        st.info(
            f"Code sent to {st.session_state.get('login_wiz_phone')} — check the Telegram "
            "app on that phone (it usually arrives as a Telegram message, not SMS)."
        )
        code = st.text_input("Login code", key="login_wiz_code_input")
        cols = st.columns(2)
        if cols[0].button("Verify code", type="primary"):
            try:
                tmp = TelegramService(
                    settings.telegram_api_id,
                    settings.telegram_api_hash,
                    st.session_state["login_wiz_session"],
                )
                needs_password, session = _run(
                    tmp.submit_code(
                        st.session_state["login_wiz_phone"],
                        code.replace(" ", "").strip(),
                        st.session_state["login_wiz_hash"],
                    )
                )
                st.session_state["login_wiz_session"] = session
                if needs_password:
                    st.session_state["login_wiz_stage"] = "password"
                    st.rerun()
                else:
                    new_id = store.create_profile(
                        st.session_state["user_id"],
                        st.session_state["login_wiz_label"],
                        session,
                    )
                    st.session_state["active_profile_id"] = new_id
                    label = st.session_state["login_wiz_label"]
                    _reset_login_wizard()
                    st.success(f"Profile '{label}' connected.")
                    st.rerun()
            except Exception as exc:
                st.error(f"Invalid or expired code: {exc}")
        if cols[1].button("Start over"):
            _reset_login_wizard()
            st.rerun()

    elif stage == "password":
        st.info(
            "This account has Two-Step Verification enabled — enter its password to finish."
        )
        password = st.text_input(
            "Telegram Two-Step Verification password",
            type="password",
            key="login_wiz_password_input",
        )
        cols = st.columns(2)
        if cols[0].button("Confirm password", type="primary"):
            try:
                tmp = TelegramService(
                    settings.telegram_api_id,
                    settings.telegram_api_hash,
                    st.session_state["login_wiz_session"],
                )
                session = _run(tmp.submit_password(password))
                new_id = store.create_profile(
                    st.session_state["user_id"],
                    st.session_state["login_wiz_label"],
                    session,
                )
                st.session_state["active_profile_id"] = new_id
                label = st.session_state["login_wiz_label"]
                _reset_login_wizard()
                st.success(f"Profile '{label}' connected.")
                st.rerun()
            except Exception as exc:
                st.error(f"Incorrect password: {exc}")
        if cols[1].button("Start over", key="password_start_over"):
            _reset_login_wizard()
            st.rerun()


def page_connect(settings, store: Storage, profile: ProfileRow | None) -> None:
    st.header("Connect")
    st.caption(
        "Each profile is one Telegram account (Telethon session). "
        "Discord uses a single bot shared by everyone."
    )

    col1, col2 = st.columns(2)
    with col1:
        st.subheader("Telegram profiles")
        profiles = _profiles_for_current_user(store)
        if profiles:
            options = {p.id: p.label for p in profiles}
            current = profile.id if profile else profiles[0].id
            chosen = st.selectbox(
                "Active profile",
                options=list(options.keys()),
                index=list(options.keys()).index(current),
                format_func=lambda i: options[i],
                key="connect_profile_select",
            )
            if chosen != st.session_state.get("active_profile_id"):
                st.session_state["active_profile_id"] = chosen
                st.rerun()

            if not settings.telegram_api_id or not settings.telegram_api_hash:
                st.warning("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in the environment.")
            elif profile:
                tg = _telegram_service(settings, profile)
                status = _run(tg.status())
                if status["ok"]:
                    st.success(status["detail"])
                else:
                    st.info(status["detail"])
        else:
            st.info("No profiles yet — add one below to get started.")

        with st.expander("Add a profile — log in with your phone number", expanded=not profiles):
            st.caption(
                "Works from a single phone, no computer or script needed — the same "
                "way Telegram logs in any new device."
            )
            _phone_login_wizard(settings, store)

        with st.expander("Advanced: paste an existing session string"):
            st.markdown(
                "For technical users who already have a session (e.g. generated locally "
                "with the bootstrap script)."
            )
            st.code(
                "powershell -ExecutionPolicy Bypass -File .\\generate_session.ps1",
                language="powershell",
            )
            st.caption("Prefer QR login? Add `--qr` after the script command.")
            label = st.text_input(
                "Profile name (e.g. \"My main account\")", key="new_profile_label"
            )
            session_value = st.text_input(
                "Paste the generated session string",
                type="password",
                key="new_profile_session",
            )
            if st.button("Save profile"):
                if not label.strip() or not session_value.strip():
                    st.error("Both a name and a session string are required.")
                else:
                    new_id = store.create_profile(
                        st.session_state["user_id"], label.strip(), session_value.strip()
                    )
                    st.session_state["active_profile_id"] = new_id
                    st.success(f"Profile '{label}' saved.")
                    st.rerun()

        if profile:
            with st.expander(f"Replace the session for '{profile.label}'"):
                replacement = st.text_input(
                    "New session string", type="password", key="replace_profile_session"
                )
                if st.button("Update session"):
                    if replacement.strip():
                        store.update_profile_session(profile.id, replacement.strip())
                        st.success("Session updated.")
                        st.rerun()
                    else:
                        st.error("Paste a session string first.")

    with col2:
        st.subheader("Discord")
        dc = DiscordService(settings.discord_bot_token)
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


def page_targets(settings, store: Storage, profile: ProfileRow | None) -> None:
    st.header("Targets")
    if not profile:
        st.info("Add a Telegram profile on the Connect page first.")
        return

    tg = _telegram_service(settings, profile)
    dc = DiscordService(settings.discord_bot_token)

    st.caption(
        "Telegram: every group/supergroup on this profile's account is messaged on "
        "Broadcast (DMs and broadcast channels are ignored). Auto-deleted and Stars-gated "
        "groups are blacklisted and skipped on later runs."
    )

    skips = store.get_telegram_skips(profile.id)
    tg_key = f"tg_targets_{profile.id}"
    dc_key = f"dc_targets_{profile.id}"

    c1, c2 = st.columns(2)
    with c1:
        st.subheader("Telegram")
        if st.button("Preview all Telegram groups"):
            try:
                with st.spinner("Loading groups…"):
                    tg_list = _run(tg.list_groups(skip_ids=set(skips.keys())))
                st.session_state[tg_key] = [
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
        tg_targets = st.session_state.get(tg_key, [])
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
            st.info("Click Preview to see every group on this profile's account.")

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
                "Pick a blacklisted group",
                options=[""] + list(skips.keys()),
                format_func=lambda i: "(pick…)" if not i else skips[i].get("name", i),
            )
            cols = st.columns(3)
            if cols[0].button("Restore selected") and restore_id:
                store.remove_telegram_skip(profile.id, restore_id)
                st.success("Restored — will be included on next broadcast.")
                st.rerun()
            if cols[1].button("Leave selected") and restore_id:
                with st.spinner("Leaving group…"):
                    result = _run(
                        tg.leave_groups(
                            [{"id": restore_id, "name": skips[restore_id].get("name", restore_id)}]
                        )
                    )[0]
                if result.status == "left":
                    store.remove_telegram_skip(profile.id, restore_id)
                    st.success(f"Left {result.target_name}.")
                else:
                    st.error(f"Failed to leave: {result.detail}")
                st.rerun()
            if cols[2].button("Clear entire blacklist"):
                store.clear_telegram_skips(profile.id)
                st.success("Blacklist cleared.")
                st.rerun()

            st.caption(
                "Leaving removes the account from the group entirely (not just skipping "
                "future broadcasts) — you'd need to be re-invited to rejoin."
            )
            if st.button(f"Leave all {len(skips)} blacklisted group(s)", type="primary"):
                targets = [
                    {"id": k, "name": v.get("name", k)} for k, v in skips.items()
                ]
                with st.spinner(f"Leaving {len(targets)} group(s)…"):
                    results = _run(tg.leave_groups(targets))
                left = [r for r in results if r.status == "left"]
                failed = [r for r in results if r.status != "left"]
                for r in left:
                    store.remove_telegram_skip(profile.id, r.target_id)
                st.success(f"Left {len(left)} group(s).")
                if failed:
                    st.warning(f"{len(failed)} could not be left — still blacklisted.")
                    st.dataframe(
                        [{"name": r.target_name, "detail": r.detail} for r in failed],
                        use_container_width=True,
                    )
                st.rerun()
        else:
            st.caption("No blacklisted groups yet.")

    with c2:
        st.subheader("Discord channels (optional)")
        selected = store.get_selected_discord_channels(profile.id)
        if st.button("Refresh Discord"):
            try:
                with st.spinner("Loading Discord channels..."):
                    dc_list = _run(dc.list_text_channels())
                st.session_state[dc_key] = [
                    {"id": t.id, "name": t.name, "raw_name": t.name}
                    for t in dc_list
                ]
            except Exception as exc:
                st.error(str(exc))
        dc_targets = st.session_state.get(dc_key, [])
        if dc_targets:
            labels = {t["id"]: t["name"] for t in dc_targets}
            default = [i for i in selected if i in labels]
            picked_dc = st.multiselect(
                "Select Discord channels",
                options=list(labels.keys()),
                default=default,
                format_func=lambda i: labels.get(i, i),
            )
        else:
            picked_dc = selected
            st.info("Click Refresh Discord to load channels the bot can post in.")

        if st.button("Save Discord selection", type="primary"):
            store.set_selected_discord_channels(profile.id, picked_dc)
            st.success(f"Saved {len(picked_dc)} Discord channel(s).")


def _render_job_panel(store: Storage, job: JobRow, runner, profile: ProfileRow) -> None:
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
            runner.request_cancel(profile.id)
            store.update_job(job.id, current_detail="Cancel requested…")
            st.warning("Cancel requested — finishes the current group, then stops.")
        if job.status == "interrupted" and cols[1].button(
            "Resume now", key=f"resume_{job.id}"
        ):
            try:
                runner.resume_interrupted(profile.id, store, profile.telegram_session)
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


def page_progress(store: Storage, profile: ProfileRow | None) -> None:
    st.header("Broadcast progress")
    if not profile:
        st.info("Add a Telegram profile on the Connect page first.")
        return
    st.caption(
        "Jobs run in the background on the server for this profile. You can switch pages, "
        "reload, or open this URL on another device — progress is shared from the database."
    )
    runner = get_job_runner()
    job = store.get_active_job(profile.id) or store.get_latest_job(profile.id)
    if not job:
        st.info("No broadcast jobs yet for this profile. Start one from Compose.")
        return

    _render_job_panel(store, job, runner, profile)

    if job.status in {"queued", "running"}:
        st.caption("Auto-refreshing every 2 seconds…")
        time.sleep(2)
        st.rerun()


def page_compose(settings, store: Storage, profile: ProfileRow | None) -> None:
    st.header("Compose & broadcast")
    if not profile:
        st.info("Add a Telegram profile on the Connect page first.")
        return

    runner = get_job_runner()
    skips = store.get_telegram_skips(profile.id)
    selected = store.get_selected_discord_channels(profile.id)
    active = store.get_active_job(profile.id)

    st.info(
        "Broadcast runs as a **background job** on the server for this profile. Leaving "
        "this page, reloading, or opening another device will not stop it — watch Progress."
    )
    st.write(
        f"Blacklisted Telegram groups: **{len(skips)}** · "
        f"Discord channels selected: **{len(selected)}**"
    )

    if active:
        st.warning(
            f"Job #{active.id} is **{active.status}** "
            f"({active.done}/{active.total or '?'}). "
            "Start is disabled until it finishes or you cancel it."
        )
        _render_job_panel(store, active, runner, profile)
        if active.status in {"queued", "running"}:
            time.sleep(2)
            st.rerun()
        return

    latest = store.get_latest_job(profile.id)
    if latest and latest.status in {"completed", "failed", "cancelled", "interrupted"}:
        with st.expander(f"Last job #{latest.id} ({latest.status})", expanded=False):
            _render_job_panel(store, latest, runner, profile)
            if latest.status == "interrupted":
                if st.button("Resume interrupted job"):
                    try:
                        runner.resume_interrupted(profile.id, store, profile.telegram_session)
                        st.rerun()
                    except Exception as exc:
                        st.error(str(exc))

    message = st.text_area(
        "Message",
        value=profile.draft_message,
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
        value=bool(selected),
    )

    if st.button("Save draft"):
        store.set_draft_message(profile.id, message)
        st.success("Draft saved")

    can_start = bool(message.strip() and profile.telegram_session)
    if st.button(
        "Start background broadcast to all Telegram groups",
        type="primary",
        disabled=not can_start,
    ):
        store.set_draft_message(profile.id, message)
        try:
            job_id = runner.start_broadcast(
                profile_id=profile.id,
                store=store,
                message=message,
                delay_seconds=float(delay),
                max_slowmode_wait=int(max_slowmode),
                include_discord=bool(include_discord),
                telegram_session=profile.telegram_session,
            )
            st.success(f"Started background job #{job_id}. Open Progress anytime.")
            st.rerun()
        except Exception as exc:
            st.error(str(exc))


def page_log(store: Storage, profile: ProfileRow | None) -> None:
    st.header("Send log")
    if not profile:
        st.info("Add a Telegram profile on the Connect page first.")
        return
    rows = store.list_send_logs(profile.id, 150)
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
    settings = get_settings()
    store = Storage(settings.database_url)
    bootstrap_admin(store, settings)

    runner = get_job_runner()
    runner.ensure_started(store)

    if not _require_auth(store):
        return

    profile = _ensure_active_profile(store)

    st.sidebar.title("Group Forwarder")
    st.sidebar.caption(f"Signed in as {st.session_state.get('user_email')}")

    profiles = _profiles_for_current_user(store)
    if profiles:
        options = {p.id: p.label for p in profiles}
        current = profile.id if profile else profiles[0].id
        chosen = st.sidebar.selectbox(
            "Active profile",
            options=list(options.keys()),
            index=list(options.keys()).index(current),
            format_func=lambda i: options[i],
            key="sidebar_profile_select",
        )
        if chosen != st.session_state.get("active_profile_id"):
            st.session_state["active_profile_id"] = chosen
            st.rerun()
        profile = store.get_profile(chosen)
    else:
        st.sidebar.caption("No profiles yet — add one on the Connect page.")

    if profile:
        active = store.get_active_job(profile.id)
        if active:
            st.sidebar.success(
                f"Job #{active.id} {active.status}: {active.done}/{active.total or '?'}"
            )

    pages = ["Connect", "Targets", "Compose", "Progress", "Log"]
    if st.session_state.get("role") == "admin":
        pages.append("Admin")
    page = st.sidebar.radio("Page", pages)

    st.sidebar.caption(
        "Only post in groups/servers where you have permission. "
        "Mass spam can get accounts banned."
    )
    st.sidebar.caption(
        "Note: Railway free tier sleeps the app when idle — a sleeping "
        "container pauses jobs until someone opens the site again (then it resumes)."
    )

    if st.sidebar.button("Log out"):
        for key in ("user_id", "role", "user_email", "must_change_password", "active_profile_id"):
            st.session_state.pop(key, None)
        st.rerun()

    if page == "Connect":
        page_connect(settings, store, profile)
    elif page == "Targets":
        page_targets(settings, store, profile)
    elif page == "Compose":
        page_compose(settings, store, profile)
    elif page == "Progress":
        page_progress(store, profile)
    elif page == "Log":
        page_log(store, profile)
    else:
        page_admin(store)


main()
