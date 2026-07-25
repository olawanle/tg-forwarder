from cryptography.fernet import Fernet

from backend.app.core.config import get_settings


def encrypt_text(value: str) -> str:
    return Fernet(get_settings().fernet_key.encode()).encrypt(value.encode()).decode()


def decrypt_text(value: str) -> str:
    return Fernet(get_settings().fernet_key.encode()).decrypt(value.encode()).decode()
