"""Admin-only page: the only way new users get added to the app."""

from __future__ import annotations

import secrets
import string

import streamlit as st

from forwarder.auth import hash_password
from forwarder.storage import Storage


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def page_admin(store: Storage) -> None:
    # Defense in depth: don't rely solely on the sidebar hiding this page.
    if st.session_state.get("role") != "admin":
        st.error("You don't have access to this page.")
        return

    st.header("Admin")
    st.caption("Create and manage accounts. There is no self-registration — this is the only way in.")

    st.subheader("Create a user")
    with st.form("create_user_form", clear_on_submit=True):
        email = st.text_input("Email")
        role = st.selectbox("Role", ["user", "admin"])
        auto_password = st.checkbox("Generate a temporary password", value=True)
        manual_password = (
            "" if auto_password else st.text_input("Temporary password", type="password")
        )
        submitted = st.form_submit_button("Create user", type="primary")
        if submitted:
            clean_email = email.strip().lower()
            if not clean_email:
                st.error("Email is required.")
            elif store.get_user_by_email(clean_email):
                st.error("A user with that email already exists.")
            else:
                temp_password = manual_password.strip() or _generate_temp_password()
                if len(temp_password) < 8:
                    st.error("Temporary password must be at least 8 characters.")
                else:
                    store.create_user(
                        email=clean_email,
                        password_hash=hash_password(temp_password),
                        role=role,
                        must_change_password=True,
                    )
                    st.success(
                        f"Created {clean_email}. Share this temporary password with them "
                        f"directly — it won't be shown again: **{temp_password}**"
                    )

    st.subheader("Users")
    users = store.list_users()
    if not users:
        st.info("No users yet.")
        return

    for user in users:
        status = "active" if user.is_active else "disabled"
        with st.expander(f"{user.email} · {user.role} · {status}"):
            profiles = store.list_profiles_for_user(user.id)
            if profiles:
                st.write("Profiles (session strings are never shown here):")
                st.dataframe(
                    [{"label": p.label, "created": p.created_at} for p in profiles],
                    use_container_width=True,
                )
            else:
                st.caption("No profiles yet.")

            cols = st.columns(2)
            if user.is_active:
                if cols[0].button("Deactivate", key=f"deactivate_{user.id}"):
                    store.set_user_active(user.id, False)
                    st.rerun()
            else:
                if cols[0].button("Reactivate", key=f"reactivate_{user.id}"):
                    store.set_user_active(user.id, True)
                    st.rerun()

            if cols[1].button("Reset password", key=f"reset_{user.id}"):
                new_password = _generate_temp_password()
                store.set_user_password(
                    user.id, hash_password(new_password), must_change_password=True
                )
                st.success(
                    f"New temporary password for {user.email}: **{new_password}**"
                )
