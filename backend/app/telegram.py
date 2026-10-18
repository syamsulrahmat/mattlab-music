import os
import json
import urllib.request
import subprocess
from pathlib import Path

# Multi-Topic Group Details for MattLab Hub
GROUP_ID = "-1003966858134"

# Thread IDs for MattLab Hub
THREAD_COMMANDS = 3
THREAD_MUSIC = 6
THREAD_DEV = 9
THREAD_ALERTS = 12

def notify_telegram(message: str, topic: str = "music") -> bool:
    """
    Send notification to MattLab Hub Telegram Group (-1003966858134)
    under the specified topic (default: music = Thread 6, dev = Thread 9).
    Falls back to user DM if group sending fails.
    """
    topic_clean = (topic or "music").lower().strip()
    if topic_clean in ("music", "spotify", "playlist", "track", "library"):
        thread_id = THREAD_MUSIC
        flag = "--music"
    elif topic_clean in ("dev", "bug", "issue"):
        thread_id = THREAD_DEV
        flag = "--dev"
    elif topic_clean in ("alert", "alerts"):
        thread_id = THREAD_ALERTS
        flag = "--alert"
    elif topic_clean in ("commands", "command"):
        thread_id = THREAD_COMMANDS
        flag = "--commands"
    else:
        thread_id = THREAD_MUSIC
        flag = "--music"

    # 1. If host /usr/local/bin/tg-notify is accessible
    if os.path.exists("/usr/local/bin/tg-notify"):
        try:
            res = subprocess.run(["/usr/local/bin/tg-notify", flag, message], check=False, capture_output=True)
            if res.returncode == 0:
                return True
        except Exception:
            pass

    # 2. Direct Telegram Bot API calling MattLab Hub Supergroup with message_thread_id
    try:
        token_path = Path("/data/telegram/token")
        if not token_path.exists():
            token_path = Path("/boot/config/plugins/dynamix/telegram/token")
            
        if token_path.exists():
            token = token_path.read_text().strip()
            if token:
                url = f"https://api.telegram.org/bot{token}/sendMessage"
                payload = json.dumps({
                    "chat_id": GROUP_ID,
                    "message_thread_id": thread_id,
                    "text": message,
                    "parse_mode": "HTML"
                }).encode("utf-8")
                req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=8) as resp:
                    if resp.status == 200:
                        return True
    except Exception as e:
        print(f"[TG NOTIFY] Error sending notification to group topic {thread_id}: {e}", flush=True)

    # 3. Fallback to DM if group topic post failed
    try:
        chatid_path = Path("/data/telegram/chatid")
        if not chatid_path.exists():
            chatid_path = Path("/boot/config/plugins/dynamix/telegram/chatid")
        token_path = Path("/data/telegram/token")
        if not token_path.exists():
            token_path = Path("/boot/config/plugins/dynamix/telegram/token")

        if token_path.exists() and chatid_path.exists():
            token = token_path.read_text().strip()
            chat_id = chatid_path.read_text().strip()
            if token and chat_id:
                url = f"https://api.telegram.org/bot{token}/sendMessage"
                payload = json.dumps({
                    "chat_id": chat_id,
                    "text": message,
                    "parse_mode": "HTML"
                }).encode("utf-8")
                req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    if resp.status == 200:
                        return True
    except Exception as fallback_err:
        print(f"[TG NOTIFY] Error in DM fallback: {fallback_err}", flush=True)

    return False
