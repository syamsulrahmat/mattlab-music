import time
import json
import re
import io
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from PIL import Image, ImageOps

from app.config import AVATARS_DIR
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
avatar_router = APIRouter(tags=["User Avatars"])

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

class UpdateProfileRequest(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    display_name: Optional[str] = Field(None, min_length=1, max_length=100)

class SelfChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=3, max_length=128)

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
        "avatar_url": None,
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

    avatar_url = row["avatar_url"] if "avatar_url" in row.keys() else None

    user = {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "display_name": row["display_name"] or row["username"],
        "avatar_url": avatar_url,
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

@router.put("/profile")
def update_profile(
    data: UpdateProfileRequest,
    response: Response,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Update profile information (username and/or display name) for current user."""
    user_id = current_user["id"]
    new_username = current_user["username"]
    new_display_name = current_user.get("display_name") or current_user["username"]

    with get_db() as conn:
        cursor = conn.cursor()

        if data.username is not None:
            clean_username = data.username.strip()
            if len(clean_username) < 3 or len(clean_username) > 50:
                raise HTTPException(status_code=400, detail="Username must be between 3 and 50 characters.")
            if not re.match(r"^[a-zA-Z0-9_-]+$", clean_username):
                raise HTTPException(status_code=400, detail="Username can only contain letters, numbers, underscores, and hyphens.")

            # Check uniqueness against other users
            cursor.execute("SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?", (clean_username, user_id))
            if cursor.fetchone():
                raise HTTPException(status_code=400, detail=f"Username '{clean_username}' is already taken.")
            new_username = clean_username

        if data.display_name is not None:
            clean_display_name = data.display_name.strip()
            if not clean_display_name:
                raise HTTPException(status_code=400, detail="Display name cannot be empty.")
            new_display_name = clean_display_name[:100]

        cursor.execute(
            "UPDATE users SET username = ?, display_name = ? WHERE id = ?",
            (new_username, new_display_name, user_id)
        )

        cursor.execute("SELECT id, username, role, display_name, avatar_url, preferences FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()

    # Re-issue auth token and update cookie in case username changed
    token = create_access_token({"user_id": user_id, "username": new_username, "role": current_user["role"]})
    set_auth_cookie(response, token)

    prefs = {}
    if row["preferences"]:
        try:
            prefs = json.loads(row["preferences"])
        except Exception:
            pass

    updated_user = {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "display_name": row["display_name"],
        "avatar_url": row["avatar_url"],
        "preferences": prefs,
    }
    return {"status": "ok", "user": updated_user, "token": token}

@router.put("/profile/password")
def change_own_password(
    data: SelfChangePasswordRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Change password for current authenticated user with current password verification."""
    user_id = current_user["id"]
    if len(data.new_password) < 3:
        raise HTTPException(status_code=400, detail="New password must be at least 3 characters.")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found.")

        if not verify_password(data.current_password, row["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")

        new_hash = hash_password(data.new_password)
        cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))

    return {"status": "ok", "message": "Password changed successfully."}

@router.post("/profile/avatar")
async def upload_avatar(
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Upload and optimize custom profile avatar image (center-cropped 1:1 square, 320x320 JPEG)."""
    user_id = current_user["id"]
    content_type = request.headers.get("content-type", "").lower()

    content = b""
    if "multipart/form-data" in content_type:
        try:
            form = await request.form()
            uploaded = form.get("file") or form.get("avatar")
            if uploaded:
                content = await uploaded.read()
        except Exception:
            content = await request.body()
    else:
        content = await request.body()

    if not content:
        raise HTTPException(status_code=400, detail="No image file provided.")

    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum avatar size is 5MB.")

    try:
        image = Image.open(io.BytesIO(content))
        # Validate format
        if (image.format or "").upper() not in {"JPEG", "JPG", "PNG", "WEBP", "GIF"}:
            raise HTTPException(status_code=400, detail="Unsupported image format. Please upload JPG, PNG, or WebP.")
        # Fix EXIF orientation from mobile cameras
        image = ImageOps.exif_transpose(image)

        # Handle palette/transparency
        if image.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", image.size, (24, 24, 24))
            if image.mode == "P":
                image = image.convert("RGBA")
            bg.paste(image, mask=image.split()[-1] if len(image.split()) == 4 else None)
            image = bg
        elif image.mode != "RGB":
            image = image.convert("RGB")

        # Center-crop to 1:1 square
        width, height = image.size
        min_dim = min(width, height)
        left = (width - min_dim) // 2
        top = (height - min_dim) // 2
        right = left + min_dim
        bottom = top + min_dim
        image = image.crop((left, top, right, bottom))

        # Resize to standard 320x320
        image = image.resize((320, 320), Image.Resampling.LANCZOS)

        # Save to disk
        AVATARS_DIR.mkdir(parents=True, exist_ok=True)
        avatar_file = AVATARS_DIR / f"user_{user_id}.jpg"
        image.save(avatar_file, "JPEG", quality=90, optimize=True)

        avatar_url = f"/api/avatars/{user_id}?v={int(time.time())}"
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE users SET avatar_url = ? WHERE id = ?", (avatar_url, user_id))

        return {
            "status": "ok",
            "avatar_url": avatar_url,
            "message": "Avatar uploaded successfully.",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process image: {str(e)}")

@router.delete("/profile/avatar")
def remove_avatar(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Remove custom avatar and reset to default initials avatar."""
    user_id = current_user["id"]
    avatar_file = AVATARS_DIR / f"user_{user_id}.jpg"
    try:
        if avatar_file.exists():
            avatar_file.unlink()
    except Exception:
        pass

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET avatar_url = NULL WHERE id = ?", (user_id,))

    return {"status": "ok", "avatar_url": None, "message": "Avatar removed."}

@avatar_router.get("/avatars/{user_id}")
def get_user_avatar(user_id: int):
    """Serve user profile avatar image with client disk caching."""
    avatar_file = AVATARS_DIR / f"user_{user_id}.jpg"
    if avatar_file.exists() and avatar_file.is_file():
        return FileResponse(
            path=str(avatar_file),
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    raise HTTPException(status_code=404, detail="Avatar not found")

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
            SELECT id, username, role, display_name, avatar_url, created_at, last_login
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
            "avatar_url": None,
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
