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
    Converts date string from DD/MM/YYYY (from frontend) 
    to YYYY-MM-DD (PostgreSQL date format).
    """
    if not date_str:
        return None
    try:
        # Check if already in YYYY-MM-DD format
        if "-" in date_str:
            parts = date_str.split("-")
            if len(parts) == 3 and len(parts[0]) == 4:
                return date_str
        # Parse from DD/MM/YYYY
        if "/" in date_str:
            parts = date_str.split("/")
            if len(parts) == 3:
                # DD/MM/YYYY -> YYYY-MM-DD
                return f"{parts[2]}-{parts[1]}-{parts[0]}"
    except Exception as e:
        print(f"Supabase Client: Error parsing date '{date_str}': {e}")
    return None

def save_cotizacion(quote_data: dict) -> bool:
    """
    Formats the quote data and inserts it structured into the Supabase table.
    """
    client = get_supabase_client()
    if not client:
        print("Supabase Client: Client not configured. Skipping save operation.")
        return False
        
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
            
            "monto_vuelos": float(quote_data.get("monto_vuelos", 0.0)),
            "fee_aereo": float(quote_data.get("fee_aereo", 0.0)),
            "monto_traslados": float(quote_data.get("monto_traslados", 0.0)),
            "gastos_iva": float(quote_data.get("gastos_iva", 0.0)),
            
            "costo_total": float(quote_data.get("costo_total", 0.0)),
            "precio_persona": float(quote_data.get("precio_persona", 0.0)),
            
            "base_habitacion": quote_data.get("base_habitacion", ""),
            "noches_alojamiento": quote_data.get("noches_alojamiento", ""),
            
            "pdf_url": quote_data.get("pdf_url", ""),
            "pptx_url": quote_data.get("pptx_url", ""),
            "slides_url": quote_data.get("slides_url", ""),
            
            # Save hotels list as a JSON array
            "hoteles": quote_data.get("hoteles", [])
        }
        
        print(f"Supabase Client: Inserting quote for '{payload['nombre_pax']}'...")
        response = client.table("cotizaciones").insert(payload).execute()
        
        # Verify response (supabase-py v2+ uses .data)
        if response and hasattr(response, 'data') and response.data:
            print("Supabase Client: Row inserted successfully!")
            return True
        else:
            print(f"Supabase Client: Insertion did not return confirmation data. Response: {response}")
            return False
    except Exception as e:
        print(f"Supabase Client: Insertion failed. Error details: {e}")
        return False
