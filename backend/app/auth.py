import os
import json
import time
import base64
import hmac
import hashlib
import secrets
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import Request, HTTPException, Depends, status
from app.config import DATA_DIR
from app.database import get_db

SECRET_FILE = DATA_DIR / ".session_secret"

def get_secret_key() -> bytes:
    """Retrieve or generate persistent session signing secret key."""
    env_secret = os.getenv("SESSION_SECRET")
    if env_secret:
        return env_secret.encode("utf-8")
    
    if SECRET_FILE.exists():
        try:
            return SECRET_FILE.read_bytes().strip()
        except Exception:
            pass
    
    # Generate new random 32-byte secret
    new_secret = secrets.token_bytes(32)
    try:
        SECRET_FILE.write_bytes(new_secret)
        SECRET_FILE.chmod(0o600)
    except Exception as e:
        print(f"[AUTH] Warning: Failed to persist secret file: {e}", flush=True)
    return new_secret

SECRET_KEY = get_secret_key()

def hash_password(password: str) -> str:
    """Hash password using cryptographic scrypt (memory-hard, GPU resistant)."""
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1)
    return "scrypt$16384$8$1$" + salt.hex() + "$" + key.hex()

def verify_password(password: str, hash_str: str) -> bool:
    """Verify password against scrypt hash string."""
    try:
        parts = hash_str.split("$")
        if len(parts) != 6 or parts[0] != "scrypt":
            return False
        n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
        salt = bytes.fromhex(parts[4])
        expected_key = bytes.fromhex(parts[5])
        computed_key = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p)
        return hmac.compare_digest(computed_key, expected_key)
    except Exception:
        return False

def create_access_token(data: Dict[str, Any], expires_in: int = 86400 * 30) -> str:
    """Create signed HMAC-SHA256 session token with expiration (default 30 days)."""
    payload = data.copy()
    payload["exp"] = int(time.time()) + expires_in
    raw_json = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    b64_payload = base64.urlsafe_b64encode(raw_json).decode("utf-8").rstrip("=")
    sig = hmac.new(SECRET_KEY, b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{b64_payload}.{sig}"

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and verify HMAC signature and expiration timestamp of token."""
    try:
        if not token or "." not in token:
            return None
        b64_payload, sig = token.split(".", 1)
        expected_sig = hmac.new(SECRET_KEY, b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        
        # Restore base64 padding
        padding = "=" * (-len(b64_payload) % 4)
        raw_json = base64.urlsafe_b64decode(b64_payload + padding)
        payload = json.loads(raw_json.decode("utf-8"))
        
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None

def get_user_count() -> int:
    """Return total number of users in database."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) as count FROM users")
        row = cursor.fetchone()
        return row["count"] if row else 0

def get_user_from_request(request: Request) -> Optional[Dict[str, Any]]:
    """Extract and authenticate user from Cookie, Authorization header, or query token."""
    token = None
    if "access_token" in request.cookies:
        token = request.cookies["access_token"]
    elif "authorization" in request.headers:
        auth_header = request.headers["authorization"]
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()
    elif "token" in request.query_params:
        token = request.query_params["token"]

    if not token:
        return None

    decoded = decode_access_token(token)
    if not decoded or "user_id" not in decoded:
        return None

    # Fetch fresh user info from DB
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, role, display_name, preferences, avatar_url, created_at, last_login FROM users WHERE id = ?", (decoded["user_id"],))
        user_row = cursor.fetchone()
        if not user_row:
            return None
        user_dict = dict(user_row)
        raw_prefs = user_dict.get("preferences")
        if raw_prefs and isinstance(raw_prefs, str):
            try:
                user_dict["preferences"] = json.loads(raw_prefs)
            except Exception:
                user_dict["preferences"] = {}
        else:
            user_dict["preferences"] = {}
        return user_dict

def get_current_user(request: Request) -> Dict[str, Any]:
    """Dependency for routes requiring authenticated user."""
    # If state already has user populated by middleware
    if hasattr(request.state, "user") and request.state.user:
        return request.state.user

    user = get_user_from_request(request)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

def get_current_user_optional(request: Request) -> Optional[Dict[str, Any]]:
    """Optional dependency that returns current user or None if unauthenticated."""
    if hasattr(request.state, "user") and request.state.user:
        return request.state.user
    return get_user_from_request(request)

def get_current_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Dependency for routes requiring admin privileges."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user
