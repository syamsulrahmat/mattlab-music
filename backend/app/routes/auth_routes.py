import time
import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from pydantic import BaseModel, Field

from app.database import get_db
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_user_count,
    get_user_from_request,
    get_current_user,
    get_current_admin,
)

router = APIRouter(prefix="/auth", tags=["Authentication & User Management"])

COOKIE_MAX_AGE = 86400 * 30  # 30 days

class SetupRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=3, max_length=128)
    display_name: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=3, max_length=128)
    role: Optional[str] = "user"
    display_name: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    password: str = Field(..., min_length=3, max_length=128)

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        max_age=COOKIE_MAX_AGE,
        expires=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,  # Set to False to support local LAN http://192.168.x.x
        path="/",
    )

@router.get("/status")
def auth_status(request: Request):
    """Check current authentication status and whether initial admin setup is required."""
    count = get_user_count()
    setup_required = (count == 0)
    current_user = get_user_from_request(request)

    return {
        "setup_required": setup_required,
        "authenticated": bool(current_user),
        "user": current_user,
    }

@router.post("/setup")
def setup_admin(data: SetupRequest, response: Response):
    """Create the initial Admin account on first run."""
    count = get_user_count()
    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin setup has already been completed.",
        )

    clean_username = data.username.strip()
    display_name = (data.display_name or clean_username).strip()
    pw_hash = hash_password(data.password)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO users (username, password_hash, role, display_name, last_login)
            VALUES (?, ?, 'admin', ?, CURRENT_TIMESTAMP)
            """,
            (clean_username, pw_hash, display_name),
        )
        new_id = cursor.lastrowid

    user = {
        "id": new_id,
        "username": clean_username,
        "role": "admin",
        "display_name": display_name,
        "preferences": {},
    }
    token = create_access_token({"user_id": new_id, "username": clean_username, "role": "admin"})
    set_auth_cookie(response, token)

    return {"status": "ok", "user": user, "token": token}

@router.post("/login")
def login(data: LoginRequest, response: Response):
    """Authenticate with username & password."""
    clean_username = data.username.strip()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ? COLLATE NOCASE", (clean_username,))
        row = cursor.fetchone()

        if not row or not verify_password(data.password, row["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password.",
            )

        # Update last login timestamp
        cursor.execute("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (row["id"],))

    prefs = {}
    raw_prefs = row["preferences"] if "preferences" in row.keys() else None
    if raw_prefs and isinstance(raw_prefs, str):
        try:
            prefs = json.loads(raw_prefs)
        except Exception:
            prefs = {}

    user = {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "display_name": row["display_name"] or row["username"],
        "preferences": prefs,
    }
    token = create_access_token({"user_id": row["id"], "username": row["username"], "role": row["role"]})
    set_auth_cookie(response, token)

    return {"status": "ok", "user": user, "token": token}

@router.post("/logout")
def logout(response: Response):
    """Log out and clear session cookie."""
    response.delete_cookie(key="access_token", path="/")
    return {"status": "ok"}

@router.get("/me")
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Return currently authenticated user profile."""
    return {"user": current_user}

@router.get("/preferences")
def get_preferences(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Get preferences for the current authenticated user."""
    return current_user.get("preferences", {})

@router.put("/preferences")
def update_preferences(payload: Dict[str, Any], current_user: Dict[str, Any] = Depends(get_current_user)):
    """Update or merge preferences for the current authenticated user."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT preferences FROM users WHERE id = ?", (current_user["id"],))
        row = cursor.fetchone()
        existing = {}
        if row and row["preferences"]:
            try:
                existing = json.loads(row["preferences"])
            except Exception:
                pass
        existing.update(payload)
        cursor.execute("UPDATE users SET preferences = ? WHERE id = ?", (json.dumps(existing), current_user["id"]))
    return {"status": "ok", "preferences": existing}

@router.get("/users")
def list_users(admin: Dict[str, Any] = Depends(get_current_admin)):
    """Admin-only: List all registered users."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, username, role, display_name, created_at, last_login
            FROM users
            ORDER BY id ASC
            """
        )
        users = [dict(row) for row in cursor.fetchall()]
    return {"users": users}

@router.post("/users")
def create_user(data: CreateUserRequest, admin: Dict[str, Any] = Depends(get_current_admin)):
    """Admin-only: Create a new user."""
    clean_username = data.username.strip()
    role = "admin" if (data.role or "").lower() == "admin" else "user"
    display_name = (data.display_name or clean_username).strip()
    pw_hash = hash_password(data.password)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = ? COLLATE NOCASE", (clean_username,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Username '{clean_username}' is already taken.",
            )

        cursor.execute(
            """
            INSERT INTO users (username, password_hash, role, display_name)
            VALUES (?, ?, ?, ?)
            """,
            (clean_username, pw_hash, role, display_name),
        )
        new_id = cursor.lastrowid

    return {
        "status": "ok",
        "user": {
            "id": new_id,
            "username": clean_username,
            "role": role,
            "display_name": display_name,
        },
    }

@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: Dict[str, Any] = Depends(get_current_admin)):
    """Admin-only: Delete a user (cannot delete yourself)."""
    if admin["id"] == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own admin account.",
        )

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username FROM users WHERE id = ?", (user_id,))
        target = cursor.fetchone()
        if not target:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))

    return {"status": "ok", "deleted_username": target["username"]}

@router.put("/users/{user_id}/password")
def change_password(
    user_id: int,
    data: ChangePasswordRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Change password for a user (Admin can change any user, users can change their own)."""
    if current_user["role"] != "admin" and current_user["id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to change this password.",
        )

    pw_hash = hash_password(data.password)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pw_hash, user_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    return {"status": "ok"}
