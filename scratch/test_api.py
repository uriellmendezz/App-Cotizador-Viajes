import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# Login as uriel
print("Logging in as uriel...")
login_payload = {"username": "uriel", "password": "giordano2026"}
if "mendez2026" in os.getenv("ALLOWED_USERS", ""):
    login_payload["password"] = "mendez2026"
elif "giordano2026" in os.getenv("ALLOWED_USERS", ""):
    login_payload["password"] = "giordano2026"

response = client.post("/api/auth/login", json=login_payload)
if response.status_code == 200:
    token = response.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Try fetching a specific quote
    quote_id = 57
    print(f"\nRequesting /api/presupuestos/{quote_id}...")
    res_q = client.get(f"/api/presupuestos/{quote_id}", headers=headers)
    print("Status Code:", res_q.status_code)
    print("Response JSON:", res_q.json())
else:
    print("Login failed")
