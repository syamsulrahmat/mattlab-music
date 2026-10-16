import json
import html
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Request, HTTPException, status
from pydantic import BaseModel
from app.database import get_db
from app.telegram import notify_telegram

router = APIRouter(prefix="/bug-reports", tags=["Bug Reports & Issue Tracker"])

class CreateBugReportRequest(BaseModel):
    type: Optional[str] = "bug"  # 'bug', 'feature', 'note'
    title: str
    category: Optional[str] = "general"
    priority: Optional[str] = "medium"
    description: str
    client_context: Optional[Dict[str, Any]] = None

class UpdateBugReportRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None  # 'open', 'in_progress', 'resolved', 'closed'
    priority: Optional[str] = None
    admin_notes: Optional[str] = None

@router.post("", status_code=status.HTTP_201_CREATED)
def create_bug_report(req: Request, data: CreateBugReportRequest):
    user = getattr(req.state, "user", None)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    title = data.title.strip()
    description = data.description.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title cannot be empty")
    if not description:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Description cannot be empty")

    report_type = data.type if data.type in ("bug", "feature", "note") else "bug"
    category = data.category or "general"
    priority = data.priority or "medium"
    context_json = json.dumps(data.client_context or {})

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO bug_reports (user_id, type, title, category, priority, description, client_context)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user["id"], report_type, title, category, priority, description, context_json))
        report_id = cursor.lastrowid

        cursor.execute("""
            SELECT b.*, u.username, u.display_name
            FROM bug_reports b
            JOIN users u ON b.user_id = u.id
            WHERE b.id = ?
        """, (report_id,))
        row = cursor.fetchone()
        report_dict = dict(row) if row else {}

    # Send instant Telegram alert to admin
    type_label = "BUG REPORT" if report_type == "bug" else ("FEATURE IDEA" if report_type == "feature" else "NOTE / TO-DO")
    emoji = "🐛" if report_type == "bug" else ("💡" if report_type == "feature" else "📝")
    
    # Extra brief diagnostic summary if attached
    diag_summary = ""
    if data.client_context:
        current_track = data.client_context.get("track")
        current_route = data.client_context.get("route")
        if current_track:
            diag_summary += f"\n<b>Track:</b> {html.escape(str(current_track))}"
        if current_route:
            diag_summary += f"\n<b>Page:</b> {html.escape(str(current_route))}"

    tg_message = (
        f"{emoji} <b>MattLab Music {type_label}</b>\n\n"
        f"<b>Title:</b> {html.escape(title)}\n"
        f"<b>Author:</b> @{html.escape(user.get('username', 'user'))} ({html.escape(user.get('role', 'user'))})\n"
        f"<b>Category:</b> {html.escape(category)} | <b>Priority:</b> {html.escape(priority)}"
        f"{diag_summary}\n\n"
        f"<b>Details:</b>\n{html.escape(description)}"
    )
    notify_telegram(tg_message)

    return report_dict

@router.get("")
def list_bug_reports(
    req: Request,
    status_filter: Optional[str] = None,
    type_filter: Optional[str] = None,
    limit: int = 100
):
    user = getattr(req.state, "user", None)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    is_admin = user.get("role") == "admin"
    query = """
        SELECT b.*, u.username, u.display_name, u.avatar_url
        FROM bug_reports b
        JOIN users u ON b.user_id = u.id
    """
    conditions = []
    params = []

    # Non-admins only see their own reports/notes (excluding those they cleared from their log)
    if not is_admin:
        conditions.append("b.user_id = ?")
        conditions.append("(b.user_deleted = 0 OR b.user_deleted IS NULL)")
        params.append(user["id"])

    if status_filter and status_filter != "all":
        conditions.append("b.status = ?")
        params.append(status_filter)

    if type_filter and type_filter != "all":
        conditions.append("b.type = ?")
        params.append(type_filter)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY b.created_at DESC LIMIT ?"
    params.append(limit)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

    reports = []
    for r in rows:
        d = dict(r)
        if d.get("client_context"):
            try:
                d["client_context"] = json.loads(d["client_context"])
            except Exception:
                d["client_context"] = {}
        reports.append(d)

    return reports

@router.get("/notifications")
def get_bug_report_notifications(req: Request):
    user = getattr(req.state, "user", None)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, title, type, category, status, updated_at
            FROM bug_reports
            WHERE user_id = ? AND status = 'resolved' AND (seen_by_user = 0 OR seen_by_user IS NULL) AND (user_deleted = 0 OR user_deleted IS NULL)
            ORDER BY updated_at DESC
        """, (user["id"],))
        rows = cursor.fetchall()

    resolved_reports = [dict(r) for r in rows]
    return {
        "unseen_count": len(resolved_reports),
        "has_notifications": len(resolved_reports) > 0,
        "resolved_reports": resolved_reports,
    }

@router.post("/mark-seen")
def mark_bug_reports_seen(req: Request):
    user = getattr(req.state, "user", None)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE bug_reports
            SET seen_by_user = 1
            WHERE user_id = ? AND status = 'resolved' AND (seen_by_user = 0 OR seen_by_user IS NULL)
        """, (user["id"],))

    return {"status": "ok", "message": "Marked all resolved issues as seen"}

@router.get("/{report_id}")
def get_bug_report(req: Request, report_id: int):
    user = getattr(req.state, "user", None)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT b.*, u.username, u.display_name, u.avatar_url
            FROM bug_reports b
            JOIN users u ON b.user_id = u.id
            WHERE b.id = ?
        """, (report_id,))
        row = cursor.fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    d = dict(row)
    if user.get("role") != "admin" and d["user_id"] != user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if d.get("client_context"):
        try:
            d["client_context"] = json.loads(d["client_context"])
        except Exception:
            d["client_context"] = {}

    return d

@router.patch("/{report_id}")
def update_bug_report(req: Request, report_id: int, data: UpdateBugReportRequest):
    user = getattr(req.state, "user", None)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    is_admin = user.get("role") == "admin"

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM bug_reports WHERE id = ?", (report_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

        report = dict(row)
        if not is_admin and report["user_id"] != user["id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        updates = []
        params = []

        if data.title is not None and data.title.strip():
            updates.append("title = ?")
            params.append(data.title.strip())

        if data.description is not None and data.description.strip():
            updates.append("description = ?")
            params.append(data.description.strip())

        if data.status is not None:
            if not is_admin:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only administrators can resolve or change issue status"
                )
            if data.status in ("open", "in_progress", "resolved", "closed"):
                updates.append("status = ?")
                params.append(data.status)
                if data.status == "resolved":
                    updates.append("seen_by_user = 0")

        if data.priority is not None:
            if not is_admin:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only administrators can change issue priority"
                )
            updates.append("priority = ?")
            params.append(data.priority)

        if data.admin_notes is not None:
            if not is_admin:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only administrators can edit admin notes"
                )
            updates.append("admin_notes = ?")
            params.append(data.admin_notes.strip())

        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(report_id)
            cursor.execute(f"UPDATE bug_reports SET {', '.join(updates)} WHERE id = ?", tuple(params))

        cursor.execute("""
            SELECT b.*, u.username, u.display_name, u.avatar_url
            FROM bug_reports b
            JOIN users u ON b.user_id = u.id
            WHERE b.id = ?
        """, (report_id,))
        updated_row = cursor.fetchone()

    return dict(updated_row) if updated_row else {}

@router.delete("/{report_id}")
def delete_bug_report(req: Request, report_id: int):
    user = getattr(req.state, "user", None)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    is_admin = user.get("role") == "admin"

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM bug_reports WHERE id = ?", (report_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

        if not is_admin and row["user_id"] != user["id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        if is_admin:
            # Admin can hard delete the report entirely from the database
            cursor.execute("DELETE FROM bug_reports WHERE id = ?", (report_id,))
        else:
            # Standard users remove it from their personal log, but it stays for admin!
            cursor.execute("UPDATE bug_reports SET user_deleted = 1, seen_by_user = 1 WHERE id = ?", (report_id,))

    return {"status": "ok", "deleted_id": report_id}
