import urllib.request
import json

BASE = "http://localhost:8000"

# 1. Login as admin
data = json.dumps({"email": "admin@ipx.dev", "password": "Admin@1234"}).encode()
req = urllib.request.Request(f"{BASE}/auth/login", data=data, headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req, timeout=10)
body = json.loads(resp.read())
token = body.get("access_token")
print("Admin token:", token[:40] if token else "MISSING", "...")

headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 2. List verification queue
req2 = urllib.request.Request(f"{BASE}/verification/queue", headers=headers)
try:
    resp2 = urllib.request.urlopen(req2, timeout=10)
    patents = json.loads(resp2.read())
    print(f"Queue count: {len(patents)}")
    for p in patents:
        pid = p["id"]
        title = p["title"]
        status = p["status"]
        ai_summary = p.get("ai_summary", "NONE")
        print(f"  Patent #{pid}: {title} | status={status} | ai_summary={ai_summary[:60] if ai_summary else 'None'}")
except Exception as e:
    print("Queue error:", e)
