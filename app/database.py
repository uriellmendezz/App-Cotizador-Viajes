import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from .env file
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

_client = None

def get_supabase_client() -> Client:
    """Initialize and return the Supabase client."""
    global _client
    if _client is not None:
        return _client
        
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Supabase Config: SUPABASE_URL or SUPABASE_KEY is missing. Database persistence is disabled.")
        return None
        
    try:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Supabase Client: Initialized successfully.")
        return _client
    except Exception as e:
        print(f"Supabase Client Error: Failed to initialize. Details: {e}")
        return None

def parse_date_to_iso(date_str):
    """
    Converts date string from DD/MM/YYYY or DD/MM/YY (from frontend) 
    to YYYY-MM-DD (PostgreSQL date format).
    """
    if not date_str:
        return None
    try:
        # Check if ISO timestamp
        if "T" in date_str:
            date_str = date_str.split("T")[0]
        # Check if already in YYYY-MM-DD format
        if "-" in date_str:
            parts = date_str.split("-")
            if len(parts) == 3 and len(parts[0]) == 4:
                return date_str
        # Parse from DD/MM/YYYY or DD/MM/YY
        if "/" in date_str:
            parts = date_str.split("/")
            if len(parts) == 3:
                year = parts[2]
                if len(year) == 2:
                    year = "20" + year
                return f"{year}-{parts[1]}-{parts[0]}"
    except Exception as e:
        print(f"Supabase Client: Error parsing date '{date_str}': {e}")
    return None

def save_cotizacion(quote_data: dict) -> dict | None:
    """
    Formats the quote data and inserts or updates it structured in the Supabase table.
    """
    client = get_supabase_client()
    if not client:
        print("Supabase Client: Client not configured. Skipping save operation.")
        return None
        
    try:
        # Normalize and construct payload
        payload = {
            "nombre_pax": quote_data.get("nombre_pax", ""),
            "destino": quote_data.get("destino", ""),
            "cantidad_pasajeros": int(quote_data.get("cantidad_pasajeros", 1)),
            "fecha_salida": parse_date_to_iso(quote_data.get("fecha_salida")),
            "origen": quote_data.get("origen", ""),
            "agente_nombre": quote_data.get("agente_nombre", ""),
            
            "fecha_vuelo_ida": parse_date_to_iso(quote_data.get("fecha_vuelo_ida")),
            "fecha_vuelo_vuelta": parse_date_to_iso(quote_data.get("fecha_vuelo_vuelta")),
            "validez_cotizacion": parse_date_to_iso(quote_data.get("validez_cotizacion")),
            
            "monto_vuelos": float(quote_data.get("monto_vuelos", 0.0)),
            "fee_aereo": float(quote_data.get("fee_aereo", 0.0)),
            "monto_traslados": float(quote_data.get("monto_traslados", 0.0)),
            "gastos_iva": float(quote_data.get("gastos_iva", 0.0)),
            
            "costo_total": float(quote_data.get("costo_total", 0.0)),
            "precio_persona": float(quote_data.get("precio_persona", 0.0)),
            
            "base_habitacion": quote_data.get("base_habitacion", ""),
            "noches_alojamiento": quote_data.get("noches_alojamiento", ""),
            
            "img_vuelo_ida": quote_data.get("img_vuelo_ida", ""),
            "img_vuelo_vuelta": quote_data.get("img_vuelo_vuelta", ""),
            "equipaje": quote_data.get("equipaje", []),
            
            # Save hotels list as a JSON array (including base64 hotel images)
            "hoteles": quote_data.get("hoteles", [])
        }
        
        quote_id = quote_data.get("id")
        if quote_id:
            print(f"Supabase Client: Updating quote #{quote_id} for '{payload['nombre_pax']}'...")
            response = client.table("cotizaciones").update(payload).eq("id", quote_id).execute()
        else:
            print(f"Supabase Client: Inserting new quote for '{payload['nombre_pax']}'...")
            response = client.table("cotizaciones").insert(payload).execute()
        
        # Verify response (supabase-py v2+ uses .data)
        if response and hasattr(response, 'data') and response.data:
            print("Supabase Client: Operation completed successfully!")
            return response.data[0]
        else:
            print(f"Supabase Client: Operation did not return confirmation data. Response: {response}")
            return None
    except Exception as e:
        print(f"Supabase Client: Operation failed. Error details: {e}")
        return None

def get_cotizaciones() -> list:
    """
    Retrieves all saved detailed quotes metadata from Supabase.
    """
    client = get_supabase_client()
    if not client:
        print("Supabase Client: Client not configured. Skipping get operation.")
        return []
    try:
        response = client.table("cotizaciones").select(
            "id, nombre_pax, destino, cantidad_pasajeros, fecha_salida, origen, agente_nombre, costo_total, precio_persona, created_at, base_habitacion"
        ).order("created_at", desc=True).execute()
        
        if response and hasattr(response, 'data') and response.data:
            # Filter out quick budgets
            return [q for q in response.data if q.get("base_habitacion") != "PRESUPUESTO_RAPIDO"]
        return []
    except Exception as e:
        print(f"Supabase Client: Failed to retrieve quotes. Details: {e}")
        return []

def get_cotizacion_by_id(quote_id) -> dict | None:
    """
    Retrieves a single quote by its ID.
    """
    client = get_supabase_client()
    if not client:
        print("Supabase Client: Client not configured. Skipping get by ID operation.")
        return None
    try:
        response = client.table("cotizaciones").select("*").eq("id", quote_id).execute()
        if response and hasattr(response, 'data') and response.data:
            return response.data[0]
        return None
    except Exception as e:
        print(f"Supabase Client: Failed to retrieve quote {quote_id}. Details: {e}")
        return None

def delete_cotizacion(quote_id) -> bool:
    """
    Deletes a quote from the database.
    """
    client = get_supabase_client()
    if not client:
        print("Supabase Client: Client not configured. Skipping delete operation.")
        return False
    try:
        response = client.table("cotizaciones").delete().eq("id", quote_id).execute()
        # Verify if deleted successfully
        return True
    except Exception as e:
        print(f"Supabase Client: Failed to delete quote {quote_id}. Details: {e}")
        return False

def save_cotizacion_rapida(quote_data: dict) -> dict | None:
    """
    Formats and inserts or updates a quick quote in the main cotizaciones table of Supabase.
    """
    client = get_supabase_client()
    if not client:
        print("Supabase Client: Client not configured. Skipping quick save operation.")
        return None
        
    try:
        # Map quick quote to detailed quote schema
        payload = {
            "nombre_pax": quote_data.get("pasajero_nombre", ""),
            "cantidad_pasajeros": int(quote_data.get("cantidad_pasajeros", 1)),
            "costo_total": float(quote_data.get("total_cotizacion", 0.0)),
            "precio_persona": float(quote_data.get("total_cotizacion", 0.0)) / max(1, int(quote_data.get("cantidad_pasajeros", 1))),
            "agente_nombre": quote_data.get("agente_id", ""),
            "base_habitacion": "PRESUPUESTO_RAPIDO",
            
            # Store lists as JSON arrays in standard fields
            "equipaje": quote_data.get("vuelos", []), # Store quick flights list in equipaje JSONB field
            "hoteles": quote_data.get("hoteles", []),   # Store quick hotels list in hoteles JSONB field
            
            # Defaults for compatibility
            "destino": "",
            "origen": "",
            "fecha_salida": None,
            "fecha_vuelo_ida": None,
            "fecha_vuelo_vuelta": None,
            "validez_cotizacion": None,
            "monto_vuelos": 0.0,
            "fee_aereo": 0.0,
            "monto_traslados": 0.0,
            "gastos_iva": float(quote_data.get("gastos_iva", 0.0)),
            "noches_alojamiento": "",
            "img_vuelo_ida": "",
            "img_vuelo_vuelta": ""
        }
        
        quote_id = quote_data.get("id")
        if quote_id:
            print(f"Supabase Client: Updating quick quote #{quote_id} for '{payload['nombre_pax']}'...")
            response = client.table("cotizaciones").update(payload).eq("id", quote_id).execute()
        else:
            print(f"Supabase Client: Inserting new quick quote for '{payload['nombre_pax']}'...")
            response = client.table("cotizaciones").insert(payload).execute()
        
        if response and hasattr(response, 'data') and response.data:
            # Map back to quick quote response format
            row = response.data[0]
            print("Supabase Client: Quick quote saved successfully!")
            return {
                "id": row["id"],
                "pasajero_nombre": row["nombre_pax"],
                "cantidad_pasajeros": row["cantidad_pasajeros"],
                "vuelos": row["equipaje"],
                "hoteles": row["hoteles"],
                "gastos_iva": row["gastos_iva"],
                "total_cotizacion": row["costo_total"],
                "agente_id": row["agente_nombre"],
                "created_at": row["created_at"]
            }
        else:
            print(f"Supabase Client: Operation did not return data. Response: {response}")
            return None
    except Exception as e:
        print(f"Supabase Client: Operation failed. Error: {e}")
        return None

def get_cotizaciones_rapidas() -> list:
    """
    Retrieves all saved quick quotes metadata from the cotizaciones Supabase table.
    """
    client = get_supabase_client()
    if not client:
        print("Supabase Client: Client not configured. Skipping get operation.")
        return []
    try:
        response = client.table("cotizaciones").select(
            "id, nombre_pax, cantidad_pasajeros, costo_total, agente_nombre, base_habitacion, created_at"
        ).eq("base_habitacion", "PRESUPUESTO_RAPIDO").order("created_at", desc=True).execute()
        
        if response and hasattr(response, 'data'):
            # Map schema to match quick quote list structure
            mapped = []
            for row in response.data:
                mapped.append({
                    "id": row["id"],
                    "pasajero_nombre": row["nombre_pax"],
                    "cantidad_pasajeros": row["cantidad_pasajeros"],
                    "total_cotizacion": row["costo_total"],
                    "agente_id": row["agente_nombre"],
                    "created_at": row["created_at"]
                })
            return mapped
        return []
    except Exception as e:
        print(f"Supabase Client: Failed to retrieve quick quotes. Details: {e}")
        return []

def get_cotizacion_rapida_by_id(quote_id) -> dict | None:
    """
    Retrieves a single quick quote by its ID from the cotizaciones Supabase table.
    """
    client = get_supabase_client()
    if not client:
        print("Supabase Client: Client not configured. Skipping get by ID operation.")
        return None
    try:
        response = client.table("cotizaciones").select("*").eq("id", quote_id).eq("base_habitacion", "PRESUPUESTO_RAPIDO").execute()
        if response and hasattr(response, 'data') and response.data:
            row = response.data[0]
            return {
                "id": row["id"],
                "pasajero_nombre": row["nombre_pax"],
                "cantidad_pasajeros": row["cantidad_pasajeros"],
                "vuelos": row["equipaje"],  # mapped back from equipaje
                "hoteles": row["hoteles"],
                "gastos_iva": row["gastos_iva"],
                "total_cotizacion": row["costo_total"],
                "agente_id": row["agente_nombre"],
                "created_at": row["created_at"]
            }
        return None
    except Exception as e:
        print(f"Supabase Client: Failed to retrieve quick quote {quote_id}. Details: {e}")
        return None

def delete_cotizacion_rapida(quote_id) -> bool:
    """
    Deletes a quick quote from the cotizaciones table.
    """
    client = get_supabase_client()
    if not client:
        print("Supabase Client: Client not configured. Skipping delete operation.")
        return False
    try:
        response = client.table("cotizaciones").delete().eq("id", quote_id).eq("base_habitacion", "PRESUPUESTO_RAPIDO").execute()
        return True
    except Exception as e:
        print(f"Supabase Client: Failed to delete quick quote {quote_id}. Details: {e}")
        return False

