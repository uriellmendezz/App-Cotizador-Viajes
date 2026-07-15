import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

print("URL:", url)
print("Key exists:", bool(key))

supabase = create_client(url, key)

print("\n--- PROFILES ---")
res = supabase.table("perfiles").select("id, nombre, username, rol, sucursal_id").execute()
for r in res.data:
    print(r)

print("\n--- SUCURSALES ---")
res_s = supabase.table("sucursales").select("id, nombre, owner_id").execute()
for s in res_s.data:
    print(s)
