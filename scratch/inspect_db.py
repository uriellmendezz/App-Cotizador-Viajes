import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

supabase = create_client(url, key)

print("Checking quick quotes fields...")
try:
    res = supabase.table("cotizaciones").select("id, nombre_pax, hoteles, equipaje").eq("base_habitacion", "PRESUPUESTO_RAPIDO").execute()
    for q in res.data[:5]:
        print(f"ID: {q['id']}, Passengers: {q['nombre_pax']}, Hoteles type: {type(q['hoteles'])}, Hoteles: {q['hoteles']}")
except Exception as e:
    print("Error querying:", e)
