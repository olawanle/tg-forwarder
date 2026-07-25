import os

from cryptography.fernet import Fernet


def test_env_example_has_required_security_keys():
    content = open(".env.example", encoding="utf-8").read()
    assert "JWT_SECRET=" in content
    assert "FERNET_KEY=" in content
    assert len(Fernet.generate_key()) > 20
