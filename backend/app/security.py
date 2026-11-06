"""Authentication helpers for the single user configured in the environment."""

import base64
import hashlib
import hmac
import json
import time
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings


PASSWORD_SCHEME = "pbkdf2_sha256"
TOKEN_ALGORITHM = "HS256"
SESSION_COOKIE_NAME = "areview_session"
bearer_scheme = HTTPBearer(auto_error=False)


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def verify_password(password: str, encoded_hash: str) -> bool:
    """Verify a PBKDF2-SHA256 encoded password in constant time."""
    try:
        scheme, iterations_raw, salt_raw, digest_raw = encoded_hash.split(":", 3)
        iterations = int(iterations_raw)
        if scheme != PASSWORD_SCHEME or iterations < 100_000:
            return False

        salt = _base64url_decode(salt_raw)
        expected_digest = _base64url_decode(digest_raw)
        actual_digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            iterations,
        )
    except (TypeError, ValueError):
        return False

    return hmac.compare_digest(actual_digest, expected_digest)


def authenticate_user(username: str, password: str) -> bool:
    username_matches = hmac.compare_digest(username, settings.AUTH_USERNAME)
    password_matches = verify_password(password, settings.AUTH_PASSWORD_HASH)
    return username_matches and password_matches


def create_access_token(username: str) -> str:
    issued_at = int(time.time())
    expires_at = issued_at + (settings.AUTH_TOKEN_EXPIRE_MINUTES * 60)
    header = {"alg": TOKEN_ALGORITHM, "typ": "JWT"}
    payload = {"sub": username, "iat": issued_at, "exp": expires_at}

    encoded_header = _base64url_encode(
        json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    encoded_payload = _base64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signed_value = f"{encoded_header}.{encoded_payload}"
    signature = hmac.new(
        settings.AUTH_SECRET_KEY.encode("utf-8"),
        signed_value.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{signed_value}.{_base64url_encode(signature)}"


def _decode_access_token(token: str) -> Optional[str]:
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
        signed_value = f"{encoded_header}.{encoded_payload}"
        expected_signature = hmac.new(
            settings.AUTH_SECRET_KEY.encode("utf-8"),
            signed_value.encode("ascii"),
            hashlib.sha256,
        ).digest()
        supplied_signature = _base64url_decode(encoded_signature)
        if not hmac.compare_digest(expected_signature, supplied_signature):
            return None

        header = json.loads(_base64url_decode(encoded_header))
        payload = json.loads(_base64url_decode(encoded_payload))
        if header.get("alg") != TOKEN_ALGORITHM:
            return None
        if not isinstance(payload.get("exp"), int) or payload["exp"] <= int(time.time()):
            return None

        username = payload.get("sub")
        if not isinstance(username, str) or not hmac.compare_digest(
            username, settings.AUTH_USERNAME
        ):
            return None
        return username
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def require_authenticated_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    authentication_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="La sesión no es válida o ha expirado.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if credentials is not None and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    if not token:
        raise authentication_error

    username = _decode_access_token(token)
    if username is None:
        raise authentication_error
    return username
