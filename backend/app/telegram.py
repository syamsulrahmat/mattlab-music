import os
import json
import urllib.request
import subprocess
from pathlib import Path

def notify_telegram(message: str) -> bool:
    """
    Send notification to MattLab Telegram bot (@mattlabunraid_bot)
    via host /usr/local/bin/tg-notify or direct Telegram Bot API fallback.
    """
    if os.path.exists("/usr/local/bin/tg-notify"):
        try:
            res = subprocess.run(["/usr/local/bin/tg-notify", message], check=False, capture_output=True)
            if res.returncode == 0:
                return True
        except Exception:
            pass

    try:
        token_path = Path("/data/telegram/token")
        chatid_path = Path("/data/telegram/chatid")
        if not token_path.exists():
            token_path = Path("/boot/config/plugins/dynamix/telegram/token")
            chatid_path = Path("/boot/config/plugins/dynamix/telegram/chatid")
            
        if token_path.exists() and chatid_path.exists():
            token = token_path.read_text().strip()
            chat_id = chatid_path.read_text().strip()
            if token and chat_id:
                url = f"https://api.telegram.org/bot{token}/sendMessage"
                payload = json.dumps({"chat_id": chat_id, "text": message, "parse_mode": "HTML"}).encode("utf-8")
                req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=5):
                    return True
    except Exception as e:
        print(f"[TG NOTIFY] Error sending notification: {e}", flush=True)

    return False
