import os, math
import json
import base64
import tempfile
import io
import requests
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Response
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv

# Import our custom modules
from app.routers.auth import get_current_user, verify_agent_user, get_current_active_agent, verify_admin_global, resolve_agent_names
from app.parser import parse_excel_or_csv
from app.database import save_cotizacion, get_cotizaciones, get_cotizacion_by_id, delete_cotizacion
from app.google_slides.mcp import create_presentation_from_template
from app.google_slides.generator import create_quotation_presentation
from app.pdf_generator import generate_pdf

load_dotenv()

router = APIRouter(prefix="/api", tags=["cotizaciones"])

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

CONFIG_FILE = os.path.join(BASE_DIR, "config", "agency_config.json")
CREDENTIALS_FILE = os.path.join(BASE_DIR, "config", "service_account.json")
TOKEN_FILE = os.path.join(BASE_DIR, "token.json")

# Load default logo base64
DEFAULT_LOGO_BASE64 = ""
default_logo_path = os.path.join(BASE_DIR, "assets", "Logo ONE TRIP.png")
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
            for k, v in DEFAULT_CONFIG.items():
                if k not in data or (data[k] == "" and v != ""):
                    data[k] = v
            return data
    except Exception:
        return DEFAULT_CONFIG

def save_agency_config(config_data):
    try:
        os.makedirs(os.path.join(BASE_DIR, "config"), exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=4, ensure_ascii=False)
    except (IOError, OSError) as e:
        print(f"Failed to write to primary config path: {e}")
        try:
            import tempfile
            tmp_config = os.path.join(tempfile.gettempdir(), "agency_config.json")
            with open(tmp_config, "w", encoding="utf-8") as f:
                json.dump(config_data, f, indent=4, ensure_ascii=False)
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

def parse_date(date_str):
    if not date_str:
        return None
    if isinstance(date_str, datetime):
        return date_str
    date_str = str(date_str).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            pass
    if "T" in date_str:
        try:
            return datetime.strptime(date_str.split("T")[0], "%Y-%m-%d")
        except ValueError:
            pass
    return None

def format_to_dd_mm_yy(date_val):
    if not date_val:
        return ""
    dt = parse_date(date_val)
    if dt:
        return dt.strftime("%d/%m/%y")
    return str(date_val)

def extract_currency(hoteles):
    if not hoteles:
        return "USD"
    for h in hoteles:
        if h.get("nombre") in ("METADATA_COTIZACION", "METADATA_PRESUPUESTO_RAPIDO"):
            return h.get("moneda", "USD")
    return "USD"

def send_notification_email(sender_franchise: str, owner_name: str, owner_email: str, agent_name: str, agent_email: str, agent_role: str, notes: str):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = os.getenv("SMTP_PORT", "587")
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    admin_email = os.getenv("GLOBAL_ADMIN_EMAIL", "admin@onetrip.com")
    
    body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #334155; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #ff545d; margin: 0; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Solicitud de Alta de Agente</h2>
            <p style="font-size: 12px; color: #94a3b8; font-weight: 600; margin: 4px 0 0 0;">One Trip Giordano · Portal de Franquicias</p>
        </div>
        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 16px 0;" />
        <p style="font-size: 14px; font-weight: 600;">Se ha recibido una nueva solicitud para registrar un agente de viajes en el sistema.</p>
        
        <h4 style="color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; margin: 20px 0 8px 0; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">Detalles del Solicitante</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: bold; width: 140px;">Franquicia / Sucursal:</td>
                <td style="padding: 4px 0; color: #1e293b; font-weight: bold;">{sender_franchise}</td>
            </tr>
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: bold;">Dueño / Encargado:</td>
                <td style="padding: 4px 0; color: #1e293b;">{owner_name} (<a href="mailto:{owner_email}" style="color: #ff545d; text-decoration: none;">{owner_email}</a>)</td>
            </tr>
        </table>
        
        <h4 style="color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; margin: 24px 0 8px 0; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">Datos del Nuevo Agente Propuesto</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: bold; width: 140px;">Nombre Completo:</td>
                <td style="padding: 4px 0; color: #1e293b; font-weight: bold;">{agent_name}</td>
            </tr>
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: bold;">Email Propuesto:</td>
                <td style="padding: 4px 0; color: #1e293b;"><a href="mailto:{agent_email}" style="color: #ff545d; text-decoration: none;">{agent_email}</a></td>
            </tr>
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: bold;">Rol Sugerido:</td>
                <td style="padding: 4px 0; color: #475569;"><span style="background-color: #f1f5f9; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: bold;">{agent_role}</span></td>
            </tr>
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: bold; vertical-align: top;">Notas/Justificación:</td>
                <td style="padding: 4px 0; color: #334155; font-style: italic; white-space: pre-wrap;">{notes or "Sin notas o justificación adicional."}</td>
            </tr>
        </table>
        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 24px 0 16px 0;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">Este es un correo automático enviado por el portal de franquicias de One Trip Giordano.</p>
    </body>
    </html>
    """
    
    if not smtp_host or not smtp_user or not smtp_password:
        print("\n=== SOLICITUD DE ALTA DE AGENTE (SMTP DESCONFIGURADO) ===")
        print(f"Franquicia: {sender_franchise}")
        print(f"Dueño: {owner_name} ({owner_email})")
        print(f"Nuevo Agente: {agent_name} ({agent_email}) - Rol: {agent_role}")
        print(f"Notas: {notes}")
        print("=========================================================\n")
        return True
        
    try:
        msg = MIMEMultipart()
        msg['From'] = smtp_user
        msg['To'] = admin_email
        msg['Subject'] = f"Solicitud de Alta de Agente: {agent_name} - Franquicia {sender_franchise}"
        
        msg.attach(MIMEText(body, 'html'))
        
        server = smtplib.SMTP(smtp_host, int(smtp_port))
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, admin_email, msg.as_string())
        server.close()
        return True
    except Exception as e:
        print(f"Error al enviar email SMTP: {e}")
        return False

@router.get("/config")
def get_config(current_agent: dict = Depends(get_current_active_agent)):
    agent_id = current_agent.get("id")
    sucursal_id = current_agent.get("sucursal_id")
    rol = current_agent.get("rol")
    
    nombre_agencia = "One Trip"
    logo_base64 = None
    colores = ["#ff545d", "#ff7f85", "#cbd5e1"]
    is_owner = False
    agentes_list = []
    
    from app.database import get_supabase_client
    client = get_supabase_client()
    
    if not client:
        return {
            "nombre_agencia": nombre_agencia,
            "logo_base64": logo_base64,
            "colores": colores,
            "is_owner": is_owner,
            "agentes": agentes_list
        }
        
    try:
        if sucursal_id:
            suc_res = client.table("sucursales").select("nombre, logo, owner_id").eq("id", sucursal_id).execute()
            if suc_res and hasattr(suc_res, 'data') and suc_res.data:
                sucursal = suc_res.data[0]
                nombre_agencia = sucursal.get("nombre", nombre_agencia)
                logo_base64 = sucursal.get("logo")
                
                owner_id = sucursal.get("owner_id")
                if owner_id and str(owner_id) == str(agent_id):
                    is_owner = True
                elif rol == "ADMIN_GLOBAL":
                    is_owner = True
                    
                if is_owner:
                    agents_res = client.table("perfiles").select("id, nombre, username, tag_color").eq("sucursal_id", sucursal_id).execute()
                    if agents_res and hasattr(agents_res, 'data'):
                        agentes_list = agents_res.data
        elif rol == "ADMIN_GLOBAL":
            is_owner = True
            agents_res = client.table("perfiles").select("id, nombre, username, tag_color").execute()
            if agents_res and hasattr(agents_res, 'data'):
                agentes_list = agents_res.data
    except Exception as e:
        print(f"Error fetching config: {e}")
        
    return {
        "nombre_agencia": nombre_agencia,
        "logo_base64": logo_base64,
        "colores": colores,
        "is_owner": is_owner,
        "agentes": agentes_list
    }

@router.post("/config")
def post_config(payload: dict, current_agent: dict = Depends(get_current_active_agent)):
    agent_id = current_agent.get("id")
    sucursal_id = current_agent.get("sucursal_id")
    rol = current_agent.get("rol")
    
    is_owner = False
    from app.database import get_supabase_client
    client = get_supabase_client()
    if not client:
        raise HTTPException(status_code=500, detail="Base de datos no disponible.")
        
    try:
        if sucursal_id:
            suc_res = client.table("sucursales").select("owner_id").eq("id", sucursal_id).execute()
            if suc_res and hasattr(suc_res, 'data') and suc_res.data:
                owner_id = suc_res.data[0].get("owner_id")
                if owner_id and str(owner_id) == str(agent_id):
                    is_owner = True
        if rol == "ADMIN_GLOBAL":
            is_owner = True
            
        if not is_owner:
            raise HTTPException(status_code=403, detail="Acceso denegado. Se requieren permisos de Dueño o Encargado de sucursal.")
            
        colores_agentes = payload.get("colores_agentes", {})
        
        for key_agent_id, color in colores_agentes.items():
            if rol != "ADMIN_GLOBAL":
                agent_check = client.table("perfiles").select("sucursal_id").eq("id", key_agent_id).execute()
                if not agent_check or not hasattr(agent_check, 'data') or not agent_check.data:
                    continue
                if str(agent_check.data[0].get("sucursal_id")) != str(sucursal_id):
                    continue
                    
            client.table("perfiles").update({"tag_color": color}).eq("id", key_agent_id).execute()
            
        return {"status": "success", "message": "Colores de etiquetas actualizados correctamente."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar configuración: {str(e)}")

@router.post("/config/solicitar-agente")
def solicitar_agente(payload: dict, current_agent: dict = Depends(get_current_active_agent)):
    agent_id = current_agent.get("id")
    sucursal_id = current_agent.get("sucursal_id")
    rol = current_agent.get("rol")
    
    is_owner = False
    from app.database import get_supabase_client
    client = get_supabase_client()
    if not client:
        raise HTTPException(status_code=500, detail="Base de datos no disponible.")
        
    try:
        sucursal_nombre = "Sin Sucursal"
        owner_name = current_agent.get("nombre", "Dueño")
        owner_email = current_agent.get("email", "")
        
        if sucursal_id:
            suc_res = client.table("sucursales").select("nombre, owner_id").eq("id", sucursal_id).execute()
            if suc_res and hasattr(suc_res, 'data') and suc_res.data:
                sucursal = suc_res.data[0]
                sucursal_nombre = sucursal.get("nombre", sucursal_nombre)
                owner_id = sucursal.get("owner_id")
                if owner_id and str(owner_id) == str(agent_id):
                    is_owner = True
                    
        if rol == "ADMIN_GLOBAL":
            is_owner = True
            
        if not is_owner:
            raise HTTPException(status_code=403, detail="Acceso denegado. Se requieren permisos de Dueño o Encargado de sucursal.")
            
        agent_name = payload.get("nombre")
        agent_email = payload.get("email")
        agent_role = payload.get("rol", "AGENTE_SUCURSAL")
        notes = payload.get("notas", "")
        
        if not agent_name or not agent_email:
            raise HTTPException(status_code=400, detail="El nombre y el correo electrónico son obligatorios.")
            
        success = send_notification_email(
            sender_franchise=sucursal_nombre,
            owner_name=owner_name,
            owner_email=owner_email,
            agent_name=agent_name,
            agent_email=agent_email,
            agent_role=agent_role,
            notes=notes
        )
        
        if success:
            return {"status": "success", "message": "Solicitud de alta enviada correctamente al Administrador Global."}
        else:
            raise HTTPException(status_code=500, detail="No se pudo enviar el correo electrónico de solicitud.")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar la solicitud: {str(e)}")

@router.post("/optimizar-descripcion")
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

@router.post("/importar-excel")
async def importar_excel(file: UploadFile = File(...), current_user: str = Depends(verify_agent_user)):
    temp_path = None
    try:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in (".xlsx", ".csv"):
            raise HTTPException(status_code=400, detail="Formato de archivo no soportado. Suba .xlsx o .csv")
            
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
        contents = await file.read()
        temp_file.write(contents)
        temp_file.close()
        temp_path = temp_file.name
        
        quotes = parse_excel_or_csv(temp_path)
        return quotes
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar el archivo: {str(e)}")
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

@router.post("/cotizar")
def api_cotizar(quote: dict, current_user: dict = Depends(get_current_active_agent)):
    config = load_agency_config()
    
    quote["agencia_nombre"] = config.get("nombre_agencia", "ONE TRIP GIORDANO")
    quote["sucursal_id"] = current_user.get("sucursal_id")
    quote["agente_id"] = current_user.get("id")
    quote["agente_nombre"] = current_user.get("nombre")
    quote["agencia_logo_base64"] = config.get("logo_base64")
    quote["colores"] = config.get("colores")
    
    cant_pax = int(quote.get("cantidad_pasajeros", 1))
    monto_vuelos = float(quote.get("monto_vuelos", 0.0))
    monto_traslados = float(quote.get("monto_traslados", 0.0))
    gastos_iva = float(quote.get("gastos_iva", 0.0))
    
    if "fee_aereo" in quote:
        fee_aereo = float(quote.get("fee_aereo", 0.0))
    else:
        fee_aereo_percent = float(quote.get("fee_aereo_percent", 10.0))
        fee_aereo = monto_vuelos * (fee_aereo_percent / 100.0)
    
    hoteles_raw = quote.get("hoteles", [])
    moneda = extract_currency(hoteles_raw)
    quote["moneda"] = moneda
    
    hoteles = [h for h in hoteles_raw if h.get("nombre") not in ("METADATA_COTIZACION", "METADATA_PRESUPUESTO_RAPIDO")]
    if not hoteles:
        raise HTTPException(status_code=400, detail="Se requiere al menos una opción de hotel.")
    
    redondear = quote.get("redondear", True)
    
    for hotel in hoteles:
        costo_hotel = float(hotel.get("costo_neto")) if "costo_neto" in hotel else float(hotel.get("costo", 0.0))
        gastos_admin = (costo_hotel + monto_traslados) * 0.05
        costo_total = (monto_vuelos + fee_aereo) + costo_hotel + monto_traslados + gastos_admin + gastos_iva
        precio_persona = costo_total / cant_pax if cant_pax > 0 else costo_total
        
        if redondear:
            # Round up per person to whole number (multiple of 10)
            rounded_pp = math.ceil(precio_persona / 10.0) * 10
            rounded_total = rounded_pp * cant_pax
        else:
            rounded_pp = round(precio_persona, 2)
            rounded_total = round(costo_total, 2)
        
        hotel["costo_neto"] = costo_hotel
        hotel["costo"] = rounded_total
        hotel["precio_persona"] = rounded_pp
    
    primary_hotel = hoteles[0]
    quote["costo_total"] = primary_hotel["costo"]
    quote["precio_persona"] = primary_hotel["precio_persona"]
    
    base_habitacion = "Single"
    if cant_pax == 2: base_habitacion = "Doble"
    elif cant_pax == 3: base_habitacion = "Triple"
    elif cant_pax == 4: base_habitacion = "Cuádruple"
    elif cant_pax > 4: base_habitacion = "Grupal"
    quote["base_habitacion"] = base_habitacion
    
    fecha_ida_dt = parse_date(quote.get("fecha_vuelo_ida"))
    fecha_vuelta_dt = parse_date(quote.get("fecha_vuelo_vuelta"))
    noches_alojamiento = "7 noches"
    if fecha_ida_dt and fecha_vuelta_dt:
        noches = abs((fecha_vuelta_dt - fecha_ida_dt).days)
        noches_alojamiento = "1 noche" if noches == 1 else f"{noches} noches"
    quote["noches_alojamiento"] = noches_alojamiento
    
    quote["fecha_vuelo_ida"] = format_to_dd_mm_yy(quote.get("fecha_vuelo_ida"))
    quote["fecha_vuelo_vuelta"] = format_to_dd_mm_yy(quote.get("fecha_vuelo_vuelta"))
    quote["fecha_salida"] = format_to_dd_mm_yy(quote.get("fecha_salida"))
    if "validez_cotizacion" in quote:
        quote["validez_cotizacion"] = format_to_dd_mm_yy(quote.get("validez_cotizacion"))
    
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
    destination = quote.get("destino", "")
    pax_str = "un pasajero" if cant_pax == 1 else f"{cant_pax} pasajeros"
    quote["detalle_aereo"] = f"Vuelos desde {origen} hacia {destination} para {pax_str}.{baggage_str}"
    quote.setdefault("detalle_hotel", f"Estadía en {destination} por {noches_alojamiento}.")
    quote.setdefault("detalle_traslado", "Traslado de llegada (aeropuerto-hotel) y traslado de salida (hotel-aeropuerto).")
    
    folder_id = config.get("google_slides_folder_id") or os.getenv("GOOGLE_SLIDES_FOLDER_ID", "") or None
    template_id = config.get("google_slides_template_id") or os.getenv("GOOGLE_SLIDES_TEMPLATE_ID", "")
    
    slides_url = None
    slides_error = None
    
    has_env_credentials = any(os.getenv(k) for k in ["GOOGLE_CREDENTIALS", "GOOGLE_CREDS_JSON", "GOOGLE_TOKEN", "GOOGLE_TOKEN_JSON"])
    if os.path.exists(CREDENTIALS_FILE) or os.path.exists(TOKEN_FILE) or has_env_credentials:
        try:
            if template_id:
                slides_url = create_presentation_from_template(template_id, folder_id or "", quote)
            else:
                slides_url = create_quotation_presentation(quote, folder_id=folder_id)
            quote["slides_url"] = slides_url
        except Exception as e:
            slides_error = str(e)
            print(f"[Slides] Error: {e}")
            if template_id and not slides_url:
                try:
                    slides_url = create_quotation_presentation(quote, folder_id=folder_id)
                    quote["slides_url"] = slides_url
                except Exception as e2:
                    slides_error = str(e2)
    else:
        slides_error = f"No Google credentials found."
        
    if not slides_url:
        raise HTTPException(status_code=500, detail=f"No se pudo generar la presentación en Google Slides. Detalle: {slides_error}")
        
    supabase_saved = save_cotizacion(quote)
    
    return {
        "status": "success",
        "slides_url": slides_url,
        "supabase_saved": supabase_saved,
        "costo_total": quote["costo_total"],
        "precio_persona": quote["precio_persona"]
    }

@router.post("/cotizar-pdf")
def api_cotizar_pdf(quote: dict, current_user: dict = Depends(get_current_active_agent)):
    config = load_agency_config()
    
    quote["agente_id"] = current_user.get("id")
    quote["sucursal_id"] = current_user.get("sucursal_id")
    quote["agente_nombre"] = current_user.get("nombre")
        
    quote["agencia_nombre"] = config.get("nombre_agencia", "ONE TRIP GIORDANO")
    quote["agencia_logo_base64"] = config.get("logo_base64")
    quote["colores"] = config.get("colores")
    
    cant_pax = safe_int(quote.get("cantidad_pasajeros", 1))
    monto_vuelos = safe_float(quote.get("monto_vuelos", 0.0))
    monto_traslados = safe_float(quote.get("monto_traslados", 0.0))
    gastos_iva = safe_float(quote.get("gastos_iva", 0.0))
    
    if "fee_aereo" in quote:
        fee_aereo = safe_float(quote.get("fee_aereo", 0.0))
    else:
        fee_aereo_percent = safe_float(quote.get("fee_aereo_percent", 10.0))
        fee_aereo = monto_vuelos * (fee_aereo_percent / 100.0)
        
    hoteles_raw = quote.get("hoteles", [])
    moneda = extract_currency(hoteles_raw)
    quote["moneda"] = moneda
    
    hoteles = [h for h in hoteles_raw if h.get("nombre") not in ("METADATA_COTIZACION", "METADATA_PRESUPUESTO_RAPIDO")]
    if not hoteles:
        raise HTTPException(status_code=400, detail="Se requiere al menos una opción de hotel.")
        
    redondear = quote.get("redondear", True)
    
    for hotel in hoteles:
        costo_hotel = safe_float(hotel.get("costo_neto")) if "costo_neto" in hotel else safe_float(hotel.get("costo", 0.0))
        gastos_admin = (costo_hotel + monto_traslados) * 0.05
        costo_total = (monto_vuelos + fee_aereo) + costo_hotel + monto_traslados + gastos_admin + gastos_iva
        precio_persona = costo_total / cant_pax if cant_pax > 0 else costo_total
        
        if redondear:
            # Round up per person to whole number (multiple of 10)
            rounded_pp = math.ceil(precio_persona / 10.0) * 10
            rounded_total = rounded_pp * cant_pax
        else:
            rounded_pp = round(precio_persona, 2)
            rounded_total = round(costo_total, 2)
        
        hotel["costo_neto"] = costo_hotel
        hotel["costo"] = rounded_total
        hotel["precio_persona"] = rounded_pp
        
    primary_hotel = hoteles[0]
    quote["costo_total"] = primary_hotel["costo"]
    quote["precio_persona"] = primary_hotel["precio_persona"]
    
    base_habitacion = "Single"
    if cant_pax == 2: base_habitacion = "Doble"
    elif cant_pax == 3: base_habitacion = "Triple"
    elif cant_pax == 4: base_habitacion = "Cuádruple"
    elif cant_pax > 4: base_habitacion = "Grupal"
    quote["base_habitacion"] = base_habitacion
    
    fecha_ida_dt = parse_date(quote.get("fecha_vuelo_ida"))
    fecha_vuelta_dt = parse_date(quote.get("fecha_vuelo_vuelta"))
    noches_alojamiento = "7 noches"
    if fecha_ida_dt and fecha_vuelta_dt:
        noches = abs((fecha_vuelta_dt - fecha_ida_dt).days)
        noches_alojamiento = "1 noche" if noches == 1 else f"{noches} noches"
    quote["noches_alojamiento"] = noches_alojamiento
    
    quote["fecha_vuelo_ida"] = format_to_dd_mm_yy(quote.get("fecha_vuelo_ida"))
    quote["fecha_vuelo_vuelta"] = format_to_dd_mm_yy(quote.get("fecha_vuelo_vuelta"))
    quote["fecha_salida"] = format_to_dd_mm_yy(quote.get("fecha_salida"))
    if "validez_cotizacion" in quote:
        quote["validez_cotizacion"] = format_to_dd_mm_yy(quote.get("validez_cotizacion"))
    
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
    pax_str = "un pasajero" if cant_pax == 1 else f"{cant_pax} pasajeros"
    quote["detalle_vuelo_completo"] = f"Vuelos desde {origen} hacia {destino} para {pax_str}.{baggage_str}"
    
    try:
        pdf_bytes = generate_pdf(quote)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando el PDF: {str(e)}")
        
    nombre = quote.get("nombre_pax", "Pasajero").replace("/", "-").replace("\\", "-")
    destino = quote.get("destino", "Destino").replace("/", "-").replace("\\", "-")
    now = datetime.now()
    fecha_str = now.strftime("%d-%m-%Y")
    hora_str = now.strftime("%H-%M-%S")
    filename = f"Cotización para {nombre} - {destino} - {fecha_str}_{hora_str}.pdf"
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.post("/extraer-pdf")
async def api_extraer_pdf(file: UploadFile = File(...), current_user: str = Depends(get_current_user)):
    try:
        from pypdf import PdfReader
    except ImportError:
        raise HTTPException(status_code=500, detail="La librería 'pypdf' no está instalada en el servidor.")
        
    try:
        contents = await file.read()
        reader = PdfReader(io.BytesIO(contents))
        metadata = reader.metadata
        quote_data_json = metadata.get("/CotizacionData")
        if not quote_data_json:
            raise HTTPException(status_code=400, detail="El PDF no contiene metadatos '/CotizacionData' válidos.")
        return json.loads(quote_data_json)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando PDF: {str(e)}")

@router.get("/cotizaciones")
def api_get_cotizaciones(current_user: dict = Depends(get_current_active_agent)):
    if current_user.get("rol") == "ADMIN_GLOBAL":
        quotes = get_cotizaciones()
    else:
        sucursal_id = current_user.get("sucursal_id")
        if not sucursal_id:
            raise HTTPException(status_code=400, detail="El agente no tiene una sucursal asignada.")
        quotes = get_cotizaciones(sucursal_id=sucursal_id)
    return resolve_agent_names(quotes, current_user)

@router.get("/cotizaciones/{quote_id}")
def api_get_cotizacion(quote_id: str, current_user: dict = Depends(get_current_active_agent)):
    try:
        quote_id_typed = int(quote_id)
    except ValueError:
        quote_id_typed = quote_id
        
    quote = get_cotizacion_by_id(quote_id_typed)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Cotización con ID {quote_id} no encontrada.")
        
    # Validar aislamiento por sucursal
    if current_user.get("rol") != "ADMIN_GLOBAL":
        if str(quote.get("sucursal_id")) != str(current_user.get("sucursal_id")):
            raise HTTPException(status_code=403, detail="No tienes permisos para acceder a esta cotización.")
            
    resolved = resolve_agent_names([quote], current_user)
    return resolved[0]

@router.post("/cotizaciones")
def api_save_cotizacion(payload: dict, current_user: dict = Depends(get_current_active_agent)):
    quote_id = payload.get("id")
    if quote_id:
        try:
            quote_id_typed = int(quote_id)
        except ValueError:
            quote_id_typed = quote_id
        existing = get_cotizacion_by_id(quote_id_typed)
        if existing:
            if current_user.get("rol") != "ADMIN_GLOBAL":
                if str(existing.get("sucursal_id")) != str(current_user.get("sucursal_id")):
                    raise HTTPException(status_code=403, detail="No puedes modificar una cotización de otra sucursal.")

    payload["agente_id"] = current_user.get("id")
    payload["sucursal_id"] = current_user.get("sucursal_id")
    payload["agente_nombre"] = current_user.get("nombre")
        
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
    
    hoteles_raw = payload.get("hoteles", [])
    moneda = extract_currency(hoteles_raw)
    payload["moneda"] = moneda
    
    hoteles = [h for h in hoteles_raw if h.get("nombre") not in ("METADATA_COTIZACION", "METADATA_PRESUPUESTO_RAPIDO")]
    redondear = payload.get("redondear", True)
    
    for hotel in hoteles:
        costo_hotel = safe_float(hotel.get("costo_neto")) if "costo_neto" in hotel else safe_float(hotel.get("costo", 0.0))
        gastos_admin = (costo_hotel + monto_traslados) * 0.05
        costo_total = (monto_vuelos + fee_aereo) + costo_hotel + monto_traslados + gastos_admin + gastos_iva
        precio_persona = costo_total / cant_pax if cant_pax > 0 else costo_total
        
        if redondear:
            # Round up per person to whole number (multiple of 10)
            rounded_pp = math.ceil(precio_persona / 10.0) * 10
            rounded_total = rounded_pp * cant_pax
        else:
            rounded_pp = round(precio_persona, 2)
            rounded_total = round(costo_total, 2)
        
        hotel["costo_neto"] = costo_hotel
        hotel["costo"] = rounded_total
        hotel["precio_persona"] = rounded_pp
        
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
    
    fecha_ida_dt = parse_date(payload.get("fecha_vuelo_ida"))
    fecha_vuelta_dt = parse_date(payload.get("fecha_vuelo_vuelta"))
    noches_alojamiento = "7 noches"
    if fecha_ida_dt and fecha_vuelta_dt:
        noches = abs((fecha_vuelta_dt - fecha_ida_dt).days)
        noches_alojamiento = "1 noche" if noches == 1 else f"{noches} noches"
    payload["noches_alojamiento"] = noches_alojamiento
    
    payload["fecha_vuelo_ida"] = format_to_dd_mm_yy(payload.get("fecha_vuelo_ida"))
    payload["fecha_vuelo_vuelta"] = format_to_dd_mm_yy(payload.get("fecha_vuelo_vuelta"))
    payload["fecha_salida"] = format_to_dd_mm_yy(payload.get("fecha_salida"))
    if "validez_cotizacion" in payload:
        payload["validez_cotizacion"] = format_to_dd_mm_yy(payload.get("validez_cotizacion"))
    
    saved_quote = save_cotizacion(payload)
    if not saved_quote:
        raise HTTPException(status_code=500, detail="No se pudo guardar la cotización.")
    return saved_quote

@router.delete("/cotizaciones/{quote_id}")
def api_delete_cotizacion(quote_id: str, current_user: dict = Depends(get_current_active_agent)):
    try:
        quote_id_typed = int(quote_id)
    except ValueError:
        quote_id_typed = quote_id
        
    quote = get_cotizacion_by_id(quote_id_typed)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Cotización con ID {quote_id} no encontrada.")
        
    if current_user.get("rol") != "ADMIN_GLOBAL":
        user_id = str(current_user.get("id") or "")
        user_name = str(current_user.get("nombre") or "").strip().lower()
        quote_agent_id = str(quote.get("agente_id") or "")
        quote_agent_name = str(quote.get("agente_nombre") or "").strip().lower()
        
        is_creator = (user_id and user_id == quote_agent_id) or (user_name and user_name == quote_agent_name)
        if not is_creator:
            raise HTTPException(
                status_code=403, 
                detail="Acceso denegado. Solo el agente creador de la cotización puede eliminarla."
            )

    success = delete_cotizacion(quote_id_typed)
    if not success:
        raise HTTPException(status_code=500, detail=f"No se pudo eliminar la cotización con ID {quote_id}.")
    return {"status": "success", "message": f"Cotización {quote_id} eliminada con éxito."}

@router.post("/cotizaciones/{quote_id}/duplicar")
def api_duplicate_cotizacion(quote_id: str, current_user: dict = Depends(get_current_active_agent)):
    try:
        quote_id_typed = int(quote_id)
    except ValueError:
        quote_id_typed = quote_id
        
    existing = get_cotizacion_by_id(quote_id_typed)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Cotización con ID {quote_id} no encontrada.")
        
    if current_user.get("rol") != "ADMIN_GLOBAL":
        if existing.get("sucursal_id") and current_user.get("sucursal_id"):
            if str(existing.get("sucursal_id")) != str(current_user.get("sucursal_id")):
                raise HTTPException(status_code=403, detail="No tienes permisos para duplicar esta cotización.")

    cloned_payload = existing.copy()
    cloned_payload.pop("id", None)
    cloned_payload.pop("created_at", None)
    cloned_payload.pop("updated_at", None)

    original_nombre = cloned_payload.get("nombre_pax", "")
    if not str(original_nombre).startswith("Copia de "):
        cloned_payload["nombre_pax"] = f"Copia de {original_nombre}"
        
    cloned_payload["agente_id"] = current_user.get("id")
    cloned_payload["sucursal_id"] = current_user.get("sucursal_id")
    cloned_payload["agente_nombre"] = current_user.get("nombre")
    cloned_payload["created_at"] = datetime.utcnow().isoformat()

    saved = save_cotizacion(cloned_payload)
    if not saved:
        raise HTTPException(status_code=500, detail="No se pudo duplicar la cotización en la base de datos.")
    return saved

