import os
import json
import base64
import tempfile
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, UploadFile, File, Header, Depends, Cookie, Response
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import secrets
import hmac
import hashlib

# Load env variables
load_dotenv()

# Base de datos predefinida de usuarios para seguridad
USERS_DB = {
    "uriel": "giordano2026",
    "admin": "onetrip2026",
    "agente1": "onetrip2026"
}

# Cargar usuarios dinámicamente desde variables de entorno si se configuran
allowed_users_env = os.getenv("ALLOWED_USERS")
if allowed_users_env:
    # Eliminar comillas simples o dobles que puedan envolver el JSON en el archivo .env
    allowed_users_env = allowed_users_env.strip("'\"")
    try:
        USERS_DB.update(json.loads(allowed_users_env))
    except Exception as e:
        print(f"Error parsing ALLOWED_USERS from environment: {e}")

# Clave secreta para la firma simétrica de los tokens
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "onetrip_super_secret_key_2026_giordano")

def create_token(payload: dict, expires_delta: timedelta) -> str:
    """Genera un token firmado criptográficamente en base64 (HMAC-SHA256)."""
    exp = int((datetime.utcnow() + expires_delta).timestamp())
    payload_copy = payload.copy()
    payload_copy["exp"] = exp
    
    # Serializar y codificar en base64
    payload_json = json.dumps(payload_copy, separators=(',', ':'))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode().rstrip("=")
    
    # Firmar el payload
    signature = hmac.new(
        SECRET_KEY.encode(),
        payload_b64.encode(),
        hashlib.sha256
    ).digest()
    signature_b64 = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    
    return f"{payload_b64}.{signature_b64}"

def decode_token(token: str) -> dict:
    """Verifica y decodifica un token firmado criptográficamente."""
    try:
        parts = token.split(".")
        if len(parts) != 2:
            raise ValueError("Token mal formado")
            
        payload_b64, signature_b64 = parts
        
        # Validar la firma
        expected_signature = hmac.new(
            SECRET_KEY.encode(),
            payload_b64.encode(),
            hashlib.sha256
        ).digest()
        expected_signature_b64 = base64.urlsafe_b64encode(expected_signature).decode().rstrip("=")
        
        if not hmac.compare_digest(signature_b64, expected_signature_b64):
            raise ValueError("Firma no coincide")
            
        # Re-agregar el padding de base64 si es necesario
        padding = len(payload_b64) % 4
        if padding:
            payload_b64 += "=" * (4 - padding)
            
        payload_json = base64.urlsafe_b64decode(payload_b64.encode()).decode()
        payload = json.loads(payload_json)
        
        # Validar la expiración
        if payload.get("exp", 0) < int(datetime.utcnow().timestamp()):
            raise ValueError("Token expirado")
            
        return payload
    except Exception as e:
        raise ValueError(f"Firma o expiración inválida: {str(e)}")

def get_current_user(authorization: str = Header(None)) -> str:
    """Dependencia de FastAPI para validar el Access Token Bearer en la cabecera."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autorizado. Token de sesión faltante.")
    token = authorization.split(" ")[1]
    try:
        payload = decode_token(token)
        if payload.get("type") == "refresh":
            raise ValueError("Token no apto para acceso")
        return payload.get("sub")
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Sesión expirada o inválida: {str(e)}")

def verify_agent_user(username: str = Depends(get_current_user)):
    """Verifica que el usuario no sea un invitado (guest)."""
    if username == "guest":
        raise HTTPException(status_code=403, detail="Acceso denegado. Permisos de agente requeridos.")
    return username

# Setup base directory dynamic path resolution
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Import our custom modules
from app.parser import parse_excel_or_csv
from app.database import save_cotizacion, get_cotizaciones, get_cotizacion_by_id, delete_cotizacion
from app.google_slides.mcp import create_presentation_from_template
from app.google_slides.generator import create_quotation_presentation

app = FastAPI(title="Sistema de Cotizaciones Google Slides - One Trip Giordano")

# CORS middleware for local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Endpoints de Autenticación ────────────────────────────────────────────────
@app.post("/api/auth/login")
def api_login(payload: dict, response: Response):
    username = payload.get("username", "").strip().lower()
    password = payload.get("password", "")
    
    if not username or not password:
        raise HTTPException(status_code=400, detail="Usuario y contraseña son requeridos.")
        
    if username in USERS_DB and USERS_DB[username] == password:
        access_token = create_token(
            payload={"sub": username, "role": "agent", "type": "access"},
            expires_delta=timedelta(minutes=15)
        )
        refresh_token = create_token(
            payload={"sub": username, "type": "refresh"},
            expires_delta=timedelta(days=7)
        )
        
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=7 * 24 * 60 * 60,
            path="/api/auth"
        )
        return {"access_token": access_token, "username": username}
    else:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")

@app.post("/api/auth/refresh")
def api_refresh(response: Response, refresh_token: str = Cookie(None)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Token de refresco faltante")
    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError("Token no válido para refresco")
            
        username = payload.get("sub")
        role = "agent" if username != "guest" else "guest"
        
        new_access_token = create_token(
            payload={"sub": username, "role": role, "type": "access"},
            expires_delta=timedelta(minutes=15)
        )
        return {"access_token": new_access_token, "username": username}
    except Exception as e:
        response.delete_cookie(key="refresh_token", path="/api/auth")
        raise HTTPException(status_code=401, detail=f"Sesión expirada o inválida: {str(e)}")

@app.post("/api/auth/logout")
def api_logout(response: Response):
    response.delete_cookie(key="refresh_token", path="/api/auth")
    return {"status": "success"}

@app.post("/api/auth/login-guest")
def api_login_guest(response: Response):
    access_token = create_token(
        payload={"sub": "guest", "role": "guest", "type": "access"},
        expires_delta=timedelta(minutes=15)
    )
    refresh_token = create_token(
        payload={"sub": "guest", "type": "refresh"},
        expires_delta=timedelta(days=7)
    )
    
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path="/api/auth"
    )
    return {"access_token": access_token, "username": "guest"}



# Ensure required directories exist
try:
    os.makedirs(os.path.join(BASE_DIR, "config"), exist_ok=True)
except Exception:
    pass

CONFIG_FILE = os.path.join(BASE_DIR, "config", "agency_config.json")
CREDENTIALS_FILE = os.path.join(BASE_DIR, "config", "service_account.json")
TOKEN_FILE = os.path.join(BASE_DIR, "token.json")

# Load default logo base64
DEFAULT_LOGO_BASE64 = ""
default_logo_path = os.path.join(BASE_DIR, "assets", "Banner letra O.png")
if os.path.exists(default_logo_path):
    try:
        with open(default_logo_path, "rb") as f:
            DEFAULT_LOGO_BASE64 = base64.b64encode(f.read()).decode("utf-8")
    except Exception as e:
        print(f"Error loading default logo: {e}")

DEFAULT_CONFIG = {
    "nombre_agencia": "One Trip Giordano",
    "colores": ["#ff545d", "#343434", "#f79646"],
    "logo_base64": DEFAULT_LOGO_BASE64,
    "nombre_agencia_legal": "One Trip Giordano S.R.L.",
    "google_slides_template_id": "",
    "google_slides_folder_id": ""
}


def load_agency_config():
    # Try tmp file first (for serverless environments)
    try:
        import tempfile
        tmp_config = os.path.join(tempfile.gettempdir(), "agency_config.json")
        if os.path.exists(tmp_config):
            with open(tmp_config, "r", encoding="utf-8") as f:
                data = json.load(f)
                for k, v in DEFAULT_CONFIG.items():
                    if k not in data or (data[k] == "" and v != ""):
                        data[k] = v
                return data
    except Exception:
        pass

    if not os.path.exists(CONFIG_FILE):
        return DEFAULT_CONFIG
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Ensure all keys are present and not empty where default is needed
            for k, v in DEFAULT_CONFIG.items():
                if k not in data or (data[k] == "" and v != ""):
                    data[k] = v
            return data
    except Exception:
        return DEFAULT_CONFIG

def save_agency_config(config_data):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=4, ensure_ascii=False)
    except (IOError, OSError) as e:
        print(f"Failed to write to primary config path: {e}")
        try:
            import tempfile
            tmp_config = os.path.join(tempfile.gettempdir(), "agency_config.json")
            with open(tmp_config, "w", encoding="utf-8") as f:
                json.dump(config_data, f, indent=4, ensure_ascii=False)
            print(f"Successfully saved config to fallback path: {tmp_config}")
        except Exception as ex:
            print(f"Failed to write to fallback config path: {ex}")

def safe_float(val, default=0.0):
    if val is None or val == "":
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

def safe_int(val, default=1):
    if val is None or val == "":
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


# API Routes

@app.get("/api/config")
def get_config(current_user: str = Depends(get_current_user)):
    return load_agency_config()

@app.post("/api/config")
def post_config(config: dict, current_user: str = Depends(verify_agent_user)):
    save_agency_config(config)
    return {"status": "success", "message": "Configuración guardada correctamente."}

@app.post("/api/optimizar-descripcion")
def optimizar_descripcion(payload: dict, current_user: str = Depends(get_current_user)):
    descripcion_original = payload.get("descripcion", "").strip()
    if not descripcion_original:
        raise HTTPException(status_code=400, detail="La descripción no puede estar vacía.")
        
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY no está configurada en las variables de entorno.")
        
    prompt_sistema = (
        "Eres un redactor experto en marketing de turismo de lujo para la agencia de viajes One Trip Giordano. "
        "Tu tarea es optimizar la descripción de un hotel provista por el agente de viajes para hacerla sumamente atractiva, fluida y persuasiva. "
        "Destaca sus servicios principales, régimen, ubicación y ventajas de forma elegante y descriptiva. "
        "Mantén la descripción concisa (máximo 4 líneas o alrededor de 60-80 palabras). "
        "No agregues saludos, firmas, introducciones ni explicaciones. Responde únicamente con el texto final optimizado."
    )
    
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {groq_api_key}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "groq/ollama/mistral-7b-instruct:latest",
        "messages": [
            {"role": "system", "content": prompt_sistema},
            {"role": "user", "content": descripcion_original}
        ],
        "temperature": 0.7
    }
    
    try:
        import requests
        res = requests.post(url, headers=headers, json=data, timeout=15)
        res.raise_for_status()
        res_data = res.json()
        descripcion_optimizada = res_data["choices"][0]["message"]["content"].strip()
        return {"descripcion_optimizada": descripcion_optimizada}
    except Exception as e:
        print(f"Error calling Groq API with main model: {e}")
        fallback_models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
        for m in fallback_models:
            try:
                print(f"Trying fallback model: {m}...")
                data["model"] = m
                res = requests.post(url, headers=headers, json=data, timeout=15)
                res.raise_for_status()
                res_data = res.json()
                descripcion_optimizada = res_data["choices"][0]["message"]["content"].strip()
                return {"descripcion_optimizada": descripcion_optimizada}
            except Exception as e2:
                print(f"Fallback model {m} failed: {e2}")
        raise HTTPException(status_code=500, detail=f"Error al optimizar la descripción: {str(e)}")

@app.post("/api/importar-excel")
async def importar_excel(file: UploadFile = File(...), current_user: str = Depends(verify_agent_user)):
    """Uploads an Excel/CSV file, parses quotes, and returns them as a JSON list."""
    temp_path = None
    try:
        # Create temp file
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in (".xlsx", ".csv"):
            raise HTTPException(status_code=400, detail="Formato de archivo no soportado. Suba .xlsx o .csv")
            
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
        contents = await file.read()
        temp_file.write(contents)
        temp_file.close()
        temp_path = temp_file.name
        
        # Parse quotes using excel_parser
        quotes = parse_excel_or_csv(temp_path)
        return quotes
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar el archivo: {str(e)}")
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/api/cotizar")
def api_cotizar(quote: dict, current_user: str = Depends(verify_agent_user)):
    """
    Recibe los datos de la cotización, genera la presentación en Google Slides
    y devuelve el link de edición. No genera PDF ni PPTX.
    """
    config = load_agency_config()
    
    # Pre-populate agency details
    quote["agencia_nombre"] = config.get("nombre_agencia", "ONE TRIP GIORDANO")
    quote["agencia_logo_base64"] = config.get("logo_base64")
    quote["colores"] = config.get("colores")
    
    # ── Financial calculations ────────────────────────────────────────────────
    cant_pax = int(quote.get("cantidad_pasajeros", 1))
    monto_vuelos = float(quote.get("monto_vuelos", 0.0))
    monto_traslados = float(quote.get("monto_traslados", 0.0))
    gastos_iva = float(quote.get("gastos_iva", 0.0))
    
    if "fee_aereo" in quote:
        fee_aereo = float(quote.get("fee_aereo", 0.0))
    else:
        fee_aereo_percent = float(quote.get("fee_aereo_percent", 10.0))
        fee_aereo = monto_vuelos * (fee_aereo_percent / 100.0)
    
    hoteles = quote.get("hoteles", [])
    if not hoteles:
        raise HTTPException(status_code=400, detail="Se requiere al menos una opción de hotel.")
    
    for hotel in hoteles:
        costo_hotel = float(hotel.get("costo", 0.0))
        gastos_admin = (costo_hotel + monto_traslados) * 0.05
        costo_total = (monto_vuelos + fee_aereo) + costo_hotel + monto_traslados + gastos_admin + gastos_iva
        precio_persona = costo_total / cant_pax if cant_pax > 0 else costo_total
        hotel["costo"] = round(costo_total, 2)
        hotel["precio_persona"] = round(precio_persona, 2)
    
    primary_hotel = hoteles[0]
    quote["costo_total"] = primary_hotel["costo"]
    quote["precio_persona"] = primary_hotel["precio_persona"]
    
    base_habitacion = "Single"
    if cant_pax == 2: base_habitacion = "Doble"
    elif cant_pax == 3: base_habitacion = "Triple"
    elif cant_pax == 4: base_habitacion = "Cuádruple"
    elif cant_pax > 4: base_habitacion = "Grupal"
    quote["base_habitacion"] = base_habitacion
    
    # Calculate nights from flight dates
    noches_alojamiento = "7 noches"
    fecha_ida = quote.get("fecha_vuelo_ida")
    fecha_vuelta = quote.get("fecha_vuelo_vuelta")
    if fecha_ida and fecha_vuelta:
        try:
            d_ida = datetime.strptime(fecha_ida, "%d/%m/%Y")
            d_vuelta = datetime.strptime(fecha_vuelta, "%d/%m/%Y")
            noches = abs((d_vuelta - d_ida).days)
            noches_alojamiento = f"{noches} noches"
        except Exception:
            pass
    quote["noches_alojamiento"] = noches_alojamiento
    
    # Build dynamic baggage description
    equipaje = quote.get("equipaje", [])
    baggage_parts = []
    for item in equipaje:
        if item == 'mano':
            baggage_parts.append("equipaje de mano")
        elif item == 'carry':
            baggage_parts.append("carry-on (10kg)")
        elif item == 'valija':
            baggage_parts.append("valija (23kg)")

    if baggage_parts:
        if len(baggage_parts) == 1:
            baggage_str = f" Incluye {baggage_parts[0]}."
        else:
            baggage_str = f" Incluye {', '.join(baggage_parts[:-1])} y {baggage_parts[-1]}."
    else:
        baggage_str = " No incluye equipaje."

    # Enrich checklist details
    origen = quote.get("origen", "Córdoba")
    destination = quote.get("destino", "")
    quote["detalle_aereo"] = f"Vuelos desde {origen} hacia {destination} para {cant_pax} pasajeros.{baggage_str}"
    quote.setdefault("detalle_hotel",
        f"Estadía en {destination} por {noches_alojamiento}.")
    quote.setdefault("detalle_traslado",
        "Traslado de llegada (aeropuerto-hotel) y traslado de salida (hotel-aeropuerto).")

    # ── Google Slides: build from template or scratch ─────────────────────────
    folder_id = config.get("google_slides_folder_id") or os.getenv("GOOGLE_SLIDES_FOLDER_ID", "") or None
    template_id = config.get("google_slides_template_id") or os.getenv("GOOGLE_SLIDES_TEMPLATE_ID", "")

    slides_url = None
    slides_error = None

    has_env_credentials = any(os.getenv(k) for k in ["GOOGLE_CREDENTIALS", "GOOGLE_CREDS_JSON", "GOOGLE_TOKEN", "GOOGLE_TOKEN_JSON"])
    if os.path.exists(CREDENTIALS_FILE) or os.path.exists(TOKEN_FILE) or has_env_credentials:
        try:
            if template_id:
                print(f"[Slides] Generating presentation by copying template '{template_id}'...")
                slides_url = create_presentation_from_template(template_id, folder_id or "", quote)
            else:
                print("[Slides] Generating presentation from scratch...")
                slides_url = create_quotation_presentation(quote, folder_id=folder_id)
            quote["slides_url"] = slides_url
            print(f"[Slides] Created: {slides_url}")
        except Exception as e:
            slides_error = str(e)
            print(f"[Slides] Error generating presentation: {e}")
            if template_id and not slides_url:
                try:
                    print("[Slides] Falling back to scratch generation...")
                    slides_url = create_quotation_presentation(quote, folder_id=folder_id)
                    quote["slides_url"] = slides_url
                except Exception as e2:
                    slides_error = str(e2)
                    print(f"[Slides] Fallback failed: {e2}")
    else:
        slides_error = f"No Google credentials found ({TOKEN_FILE} or {CREDENTIALS_FILE})."
        print(f"[Slides] {slides_error}")

    if not slides_url:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo generar la presentación en Google Slides. Detalle: {slides_error}"
        )

    # ── Supabase persistence ─────────────────────────────────────────────────
    supabase_saved = save_cotizacion(quote)
    
    return {
        "status": "success",
        "slides_url": slides_url,
        "supabase_saved": supabase_saved,
        "costo_total": quote["costo_total"],
        "precio_persona": quote["precio_persona"]
    }


@app.post("/api/cotizar-pdf")
def api_cotizar_pdf(quote: dict, current_user: str = Depends(verify_agent_user)):
    """
    Recibe los datos de la cotización, calcula costos y genera un PDF
    profesional con WeasyPrint. Devuelve el archivo PDF como descarga.
    """
    import io
    from app.pdf_generator import generate_pdf

    config = load_agency_config()

    # Auto-detect logged in agent from active session for PDF rendering
    if current_user == "guest":
        quote["agente_nombre"] = "Invitado"
    else:
        quote["agente_nombre"] = current_user.capitalize()

    # Pre-populate agency details
    quote["agencia_nombre"] = config.get("nombre_agencia", "ONE TRIP GIORDANO")
    quote["agencia_logo_base64"] = config.get("logo_base64")
    quote["colores"] = config.get("colores")

    # ── Financial calculations (same as /api/cotizar) ─────────────────────
    cant_pax = safe_int(quote.get("cantidad_pasajeros", 1))
    monto_vuelos = safe_float(quote.get("monto_vuelos", 0.0))
    monto_traslados = safe_float(quote.get("monto_traslados", 0.0))
    gastos_iva = safe_float(quote.get("gastos_iva", 0.0))

    if "fee_aereo" in quote:
        fee_aereo = safe_float(quote.get("fee_aereo", 0.0))
    else:
        fee_aereo_percent = safe_float(quote.get("fee_aereo_percent", 10.0))
        fee_aereo = monto_vuelos * (fee_aereo_percent / 100.0)

    hoteles = quote.get("hoteles", [])
    if not hoteles:
        raise HTTPException(status_code=400, detail="Se requiere al menos una opción de hotel.")

    for hotel in hoteles:
        costo_hotel = safe_float(hotel.get("costo", 0.0))
        gastos_admin = (costo_hotel + monto_traslados) * 0.05
        costo_total = (monto_vuelos + fee_aereo) + costo_hotel + monto_traslados + gastos_admin + gastos_iva
        precio_persona = costo_total / cant_pax if cant_pax > 0 else costo_total
        hotel["costo"] = round(costo_total, 2)
        hotel["precio_persona"] = round(precio_persona, 2)

    primary_hotel = hoteles[0]
    quote["costo_total"] = primary_hotel["costo"]
    quote["precio_persona"] = primary_hotel["precio_persona"]

    base_habitacion = "Single"
    if cant_pax == 2: base_habitacion = "Doble"
    elif cant_pax == 3: base_habitacion = "Triple"
    elif cant_pax == 4: base_habitacion = "Cuádruple"
    elif cant_pax > 4: base_habitacion = "Grupal"
    quote["base_habitacion"] = base_habitacion

    # Calculate nights from flight dates
    noches_alojamiento = "7 noches"
    fecha_ida = quote.get("fecha_vuelo_ida")
    fecha_vuelta = quote.get("fecha_vuelo_vuelta")
    if fecha_ida and fecha_vuelta:
        try:
            d_ida = datetime.strptime(fecha_ida, "%d/%m/%Y")
            d_vuelta = datetime.strptime(fecha_vuelta, "%d/%m/%Y")
            noches = abs((d_vuelta - d_ida).days)
            noches_alojamiento = f"{noches} noches"
        except Exception:
            pass
    quote["noches_alojamiento"] = noches_alojamiento

    # Build dynamic baggage description
    equipaje = quote.get("equipaje", [])
    baggage_parts = []
    for item in equipaje:
        if item == 'mano':
            baggage_parts.append("equipaje de mano")
        elif item == 'carry':
            baggage_parts.append("carry-on (10kg)")
        elif item == 'valija':
            baggage_parts.append("valija (23kg)")

    if baggage_parts:
        if len(baggage_parts) == 1:
            baggage_str = f" Incluye {baggage_parts[0]}."
        else:
            baggage_str = f" Incluye {', '.join(baggage_parts[:-1])} y {baggage_parts[-1]}."
    else:
        baggage_str = " No incluye equipaje."

    origen = quote.get("origen", "Córdoba")
    destino = quote.get("destino", "Destino")
    quote["detalle_vuelo_completo"] = f"Vuelos desde {origen} hacia {destino} para {cant_pax} pasajeros.{baggage_str}"

    # ── Generate PDF ──────────────────────────────────────────────────────
    try:
        pdf_bytes = generate_pdf(quote)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando el PDF: {str(e)}")

    # Build filename
    nombre = quote.get("nombre_pax", "Pasajero").replace("/", "-").replace("\\", "-")
    destino = quote.get("destino", "Destino").replace("/", "-").replace("\\", "-")
    now = datetime.now()
    fecha_str = now.strftime("%d-%m-%Y")
    hora_str = now.strftime("%H-%M-%S")
    filename = f"Cotización para {nombre} - {destino} - {fecha_str}_{hora_str}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )



@app.post("/api/extraer-pdf")
async def api_extraer_pdf(file: UploadFile = File(...), current_user: str = Depends(get_current_user)):
    """
    Recibe un archivo PDF de cotización generado por este sistema,
    lee los metadatos '/CotizacionData' que contienen el JSON original
    del formulario, y lo devuelve.
    """
    import io
    import json
    try:
        from pypdf import PdfReader
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="La librería 'pypdf' no está instalada en el servidor."
        )

    try:
        contents = await file.read()
        reader = PdfReader(io.BytesIO(contents))
        metadata = reader.metadata
        quote_data_json = metadata.get("/CotizacionData")
        if not quote_data_json:
            raise HTTPException(
                status_code=400,
                detail="El archivo PDF no contiene los metadatos '/CotizacionData' de cotización válidos de este sistema."
            )
        
        # Make sure it is parsed as JSON
        quote_data = json.loads(quote_data_json)
        return quote_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ocurrió un error al procesar el archivo PDF: {str(e)}"
        )



@app.get("/api/cotizaciones")
def api_get_cotizaciones(current_user: str = Depends(verify_agent_user)):
    """Returns all saved quotes from Supabase."""
    quotes = get_cotizaciones()
    return quotes

@app.get("/api/cotizaciones/{quote_id}")
def api_get_cotizacion(quote_id: str, current_user: str = Depends(verify_agent_user)):
    """Returns a single quote's complete data by its ID."""
    try:
        quote_id_typed = int(quote_id)
    except ValueError:
        quote_id_typed = quote_id
        
    quote = get_cotizacion_by_id(quote_id_typed)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Cotización con ID {quote_id} no encontrada.")
    return quote

@app.post("/api/cotizaciones")
def api_save_cotizacion(payload: dict, current_user: str = Depends(verify_agent_user)):
    """Saves or updates a quote in Supabase."""
    # Auto-detect logged in agent from active session
    if current_user == "guest":
        payload["agente_nombre"] = "Invitado"
    else:
        payload["agente_nombre"] = current_user.capitalize()

    cant_pax = safe_int(payload.get("cantidad_pasajeros", 1))
    monto_vuelos = safe_float(payload.get("monto_vuelos", 0.0))
    monto_traslados = safe_float(payload.get("monto_traslados", 0.0))
    gastos_iva = safe_float(payload.get("gastos_iva", 0.0))

    if "fee_aereo" in payload:
        fee_aereo = safe_float(payload.get("fee_aereo", 0.0))
    else:
        fee_aereo_percent = safe_float(payload.get("fee_aereo_percent", 10.0))
        fee_aereo = monto_vuelos * (fee_aereo_percent / 100.0)
    
    payload["fee_aereo"] = fee_aereo

    hoteles = payload.get("hoteles", [])
    for hotel in hoteles:
        costo_hotel = safe_float(hotel.get("costo", 0.0))
        gastos_admin = (costo_hotel + monto_traslados) * 0.05
        costo_total = (monto_vuelos + fee_aereo) + costo_hotel + monto_traslados + gastos_admin + gastos_iva
        precio_persona = costo_total / cant_pax if cant_pax > 0 else costo_total
        hotel["costo"] = round(costo_total, 2)
        hotel["precio_persona"] = round(precio_persona, 2)

    if hoteles:
        primary_hotel = hoteles[0]
        payload["costo_total"] = primary_hotel["costo"]
        payload["precio_persona"] = primary_hotel["precio_persona"]

    base_habitacion = "Single"
    if cant_pax == 2: base_habitacion = "Doble"
    elif cant_pax == 3: base_habitacion = "Triple"
    elif cant_pax == 4: base_habitacion = "Cuádruple"
    elif cant_pax > 4: base_habitacion = "Grupal"
    payload["base_habitacion"] = base_habitacion

    noches_alojamiento = "7 noches"
    fecha_ida = payload.get("fecha_vuelo_ida")
    fecha_vuelta = payload.get("fecha_vuelo_vuelta")
    if fecha_ida and fecha_vuelta:
        try:
            d_ida = datetime.strptime(fecha_ida, "%d/%m/%Y")
            d_vuelta = datetime.strptime(fecha_vuelta, "%d/%m/%Y")
            noches = abs((d_vuelta - d_ida).days)
            noches_alojamiento = f"{noches} noches"
        except Exception:
            pass
    payload["noches_alojamiento"] = noches_alojamiento

    # Save to Supabase (this will perform insert or update depending on presence of id)
    saved_quote = save_cotizacion(payload)
    if not saved_quote:
        raise HTTPException(status_code=500, detail="No se pudo guardar la cotización en la base de datos.")
    return saved_quote

@app.delete("/api/cotizaciones/{quote_id}")
def api_delete_cotizacion(quote_id: str, current_user: str = Depends(verify_agent_user)):
    """Deletes a quote from Supabase by its ID."""
    try:
        quote_id_typed = int(quote_id)
    except ValueError:
        quote_id_typed = quote_id
        
    success = delete_cotizacion(quote_id_typed)
    if not success:
        raise HTTPException(status_code=500, detail=f"No se pudo eliminar la cotización con ID {quote_id}.")
    return {"status": "success", "message": f"Cotización {quote_id} eliminada con éxito."}


# Mount static files folder
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

# Mount assets folder
app.mount("/assets", StaticFiles(directory=os.path.join(BASE_DIR, "assets")), name="assets")

# Serve index.html at root
@app.get("/")
def read_root():
    from fastapi.responses import FileResponse
    return FileResponse(os.path.join(BASE_DIR, "static", "index.html"))

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    from fastapi.responses import FileResponse
    return FileResponse(os.path.join(BASE_DIR, "assets", "favicon.png"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
