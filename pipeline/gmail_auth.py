"""One-time Gmail login: opens a browser, saves the refresh token to .env,
then prints the 3 newest FreeFood subjects as a smoke test.

Run from the repo root:  .venv/bin/python pipeline/gmail_auth.py
"""
import json
from pathlib import Path

from dotenv import set_key
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

ROOT = Path(__file__).resolve().parent.parent
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
LABEL = "FreeFood"

flow = InstalledAppFlow.from_client_secrets_file(ROOT / "credentials.json", SCOPES)
creds = flow.run_local_server(port=0, prompt="consent", access_type="offline")

client = json.loads((ROOT / "credentials.json").read_text())["installed"]
env = str(ROOT / ".env")
set_key(env, "GMAIL_CLIENT_ID", client["client_id"], quote_mode="never")
set_key(env, "GMAIL_CLIENT_SECRET", client["client_secret"], quote_mode="never")
set_key(env, "GMAIL_REFRESH_TOKEN", creds.refresh_token, quote_mode="never")
print("Saved Gmail credentials to .env")

gmail = build("gmail", "v1", credentials=creds)
labels = {l["name"] for l in gmail.users().labels().list(userId="me").execute()["labels"]}
if LABEL not in labels:
    print(f"Login works, but no '{LABEL}' label exists yet. Create the bmail filter.")
else:
    msgs = gmail.users().messages().list(userId="me", q=f"label:{LABEL}", maxResults=3).execute()
    for m in msgs.get("messages", []):
        meta = gmail.users().messages().get(
            userId="me", id=m["id"], format="metadata", metadataHeaders=["Subject"]
        ).execute()
        print("-", next((h["value"] for h in meta["payload"]["headers"]), "(no subject)"))
    if not msgs.get("messages"):
        print(f"Login works; '{LABEL}' label is empty so far.")
