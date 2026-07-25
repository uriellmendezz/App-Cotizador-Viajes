import os
import json
import base64
import hmac
import hashlib
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Cookie, Response, Header
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Security Config ──────────────────────────────────────────────────────────
# Cookies use Secure=True only in production (HTTPS).
# In development (localhost), Secure must be False for cookies to work over HTTP.
_IS_DEV = os.getenv("ENV", "development").lower() in ("development", "dev", "local")
_COOKIE_SECURE = not _IS_DEV

# Token durations
_ACCESS_TOKEN_MINUTES = 15
_REFRESH_TOKEN_DAYS = 7

# Base de datos predefinida de usuarios
USERS_DB = {
    "uriel": "giordano2026",
    "admin": "onetrip2026",
    "agente1": "onetrip2026"
}

# Cargar usuarios dinámicamente desde variables de entorno si se configuran
allowed_users_env = os.getenv("ALLOWED_USERS")
if allowed_users_env:
    allowed_users_env = allowed_users_env.strip("'\"")
    try:
        USERS_DB.update(json.loads(allowed_users_env))
    except Exception as e:
        print(f"Error parsing ALLOWED_USERS from environment: {e}")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "onetrip_super_secret_key_2026_giordano")

def create_token(payload: dict, expires_delta: timedelta) -> str:
    """Genera un token firmado criptográficamente en base64 (HMAC-SHA256)."""
    exp = int((datetime.utcnow() + expires_delta).timestamp())
    payload_copy = payload.copy()
    payload_copy["exp"] = exp
    
    payload_json = json.dumps(payload_copy, separators=(',', ':'))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode().rstrip("=")
    
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
        
        expected_signature = hmac.new(
            SECRET_KEY.encode(),
            payload_b64.encode(),
            hashlib.sha256
        ).digest()
        expected_signature_b64 = base64.urlsafe_b64encode(expected_signature).decode().rstrip("=")
        
        if not hmac.compare_digest(signature_b64, expected_signature_b64):
            raise ValueError("Firma no coincide")
            
        padding = len(payload_b64) % 4
        if padding:
            payload_b64 += "=" * (4 - padding)
            
        payload_json = base64.urlsafe_b64decode(payload_b64.encode()).decode()
        payload = json.loads(payload_json)
        
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

def get_current_agent(authorization: str = Header(None)) -> dict:
    """
    Dependencia de FastAPI para validar token de agente.
    Deniega el acceso con 403 Forbidden si se intenta usar un token de ADMIN_GLOBAL.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autorizado. Token de sesión faltante.")
    token = authorization.split(" ")[1]
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Token no apto para acceso")
        
        rol = payload.get("rol", "AGENTE_SUCURSAL")
        if rol == "ADMIN_GLOBAL":
            raise HTTPException(
                status_code=403, 
                detail="Acceso denegado. Un token de administrador no puede consumir endpoints de agente."
            )
            
        sub = payload.get("sub")
        if sub == "guest":
            return {
                "id": "guest",
                "nombre": "Invitado",
                "email": "guest@onetrip.com",
                "rol": "AGENTE_SUCURSAL",
                "sucursal_id": None
            }
            
        return {
            "id": sub,
            "nombre": payload.get("nombre", sub),
            "email": payload.get("email"),
            "rol": rol,
            "sucursal_id": payload.get("sucursal_id")
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Sesión expirada o inválida: {str(e)}")

def get_current_active_agent(authorization: str = Header(None)) -> dict:
    """Alias para la dependencia get_current_agent para compatibilidad."""
    return get_current_agent(authorization=authorization)

def get_current_user_token(authorization: str = Header(None)) -> dict:
    """Valida cualquier token de acceso (agente, dueño de franquicia o admin global)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autorizado. Token de sesión faltante.")
    token = authorization.split(" ")[1]
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Token no apto para acceso")
        return {
            "id": payload.get("sub"),
            "nombre": payload.get("nombre"),
            "email": payload.get("email"),
            "rol": payload.get("rol", "AGENTE_SUCURSAL"),
            "sucursal_id": payload.get("sucursal_id"),
            "franchise_id": payload.get("sucursal_id")
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Sesión expirada o inválida: {str(e)}")

def get_current_franchise_owner(authorization: str = Header(None)) -> dict:
    """
    Dependencia de FastAPI para validar permisos de Dueño de Franquicia o Administrador.
    Deniega el acceso con 403 Forbidden a agentes comunes sin rol privilegiado.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autorizado. Token de sesión faltante.")
    token = authorization.split(" ")[1]
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Token no apto para acceso")
            
        rol = payload.get("rol", "AGENTE_SUCURSAL")
        sub = payload.get("sub")
        sucursal_id = payload.get("sucursal_id")
        
        is_owner = rol in ("DUENO_FRANQUICIA", "ADMIN_SUCURSAL", "ADMIN_GLOBAL")
        
        if not is_owner and sucursal_id and sub and sub != "guest":
            try:
                from app.database import get_supabase_client
                client = get_supabase_client()
                if client:
                    suc_res = client.table("sucursales").select("owner_id").eq("id", sucursal_id).execute()
                    if suc_res and hasattr(suc_res, "data") and suc_res.data:
                        owner_id = suc_res.data[0].get("owner_id")
                        if owner_id and str(owner_id) == str(sub):
                            is_owner = True
            except Exception as e:
                print(f"Error checking owner status: {e}")

        if not is_owner:
            raise HTTPException(
                status_code=403, 
                detail="Acceso denegado. Se requieren permisos de Dueño de Franquicia o Administrador de Sucursal."
            )
            
        return {
            "id": sub,
            "nombre": payload.get("nombre", sub),
            "email": payload.get("email"),
            "rol": rol,
            "sucursal_id": sucursal_id,
            "franchise_id": sucursal_id
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Sesión expirada o inválida: {str(e)}")

def get_current_admin(authorization: str = Header(None)) -> dict:
    """
    Dependencia de FastAPI para validar token de administración (ADMIN_GLOBAL).
    Deniega el acceso con 403 Forbidden a cualquier usuario no administrador.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autorizado. Token de sesión faltante.")
    token = authorization.split(" ")[1]
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Token no apto para acceso")
            
        rol = payload.get("rol")
        if rol != "ADMIN_GLOBAL":
            raise HTTPException(
                status_code=403, 
                detail="Acceso denegado. Se requieren permisos de Administrador Global."
            )
            
        sub = payload.get("sub")
        return {
            "id": sub,
            "nombre": payload.get("nombre", sub),
            "email": payload.get("email"),
            "rol": rol,
            "sucursal_id": payload.get("sucursal_id")
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Sesión expirada o inválida: {str(e)}")

def verify_admin_global(authorization: str = Header(None)) -> dict:
    """Alias para la dependencia get_current_admin para compatibilidad."""
    return get_current_admin(authorization=authorization)

def resolve_agent_names(quotes: list, current_user: dict = None) -> list:
    """
    Enriquece listas de cotizaciones asegurando nombres de agente legibles.
    Si agente_nombre es un UUID o está vacío, lo resuelve contra current_user o la tabla perfiles de Supabase.
    """
    if not quotes:
        return []

    unresolved_uuids = set()
    user_id_curr = current_user.get("id") if current_user else None
    user_name_curr = current_user.get("nombre") if current_user else None

    for q in quotes:
        agent_name = q.get("agente_nombre")
        agent_id = q.get("agente_id")

        if not agent_name or "-" in str(agent_name) or len(str(agent_name)) > 20:
            if user_id_curr and (agent_id == user_id_curr or agent_name == user_id_curr):
                q["agente_nombre"] = user_name_curr
            elif agent_id and ("-" in str(agent_id) or len(str(agent_id)) > 20):
                unresolved_uuids.add(str(agent_id))
            elif agent_name and ("-" in str(agent_name) or len(str(agent_name)) > 20):
                unresolved_uuids.add(str(agent_name))

    if unresolved_uuids:
        try:
            from app.database import get_supabase_client
            supabase = get_supabase_client()
            if supabase:
                res = supabase.table("perfiles").select("id, nombre, username").in_("id", list(unresolved_uuids)).execute()
                if res and hasattr(res, "data") and res.data:
                    name_map = {
                        p["id"]: (p.get("nombre") or p.get("username")) for p in res.data if p.get("nombre") or p.get("username")
                    }
                    for q in quotes:
                        agent_name = q.get("agente_nombre")
                        agent_id = q.get("agente_id")
                        if not agent_name or "-" in str(agent_name) or len(str(agent_name)) > 20:
                            if agent_id in name_map:
                                q["agente_nombre"] = name_map[agent_id]
                            elif agent_name in name_map:
                                q["agente_nombre"] = name_map[agent_name]
        except Exception as e:
            print(f"Error resolving agent names from perfiles: {e}")

    for q in quotes:
        agent_name = q.get("agente_nombre")
        if not agent_name or "-" in str(agent_name) or len(str(agent_name)) > 20:
            if user_id_curr and q.get("agente_id") == user_id_curr:
                q["agente_nombre"] = user_name_curr
            # No fallback to "Agente" — preserve agente_id for traceability.
            # The frontend's getCleanAgentName() handles display formatting.

    return quotes

@router.post("/login")
def api_login(payload: dict, response: Response):
    username = payload.get("username", "").strip().lower()
    password = payload.get("password", "")
    
    if not username or not password:
        raise HTTPException(status_code=400, detail="Usuario y contraseña son requeridos.")
        
    # Intentar autenticar con Supabase Auth primero
    from app.database import get_supabase_client
    supabase = get_supabase_client()
    if supabase:
        try:
            email = username
            # Si no es un email, buscar si coincide con el nombre de perfil para obtener el email
            if "@" not in email:
                try:
                    from app.routers.admin import get_supabase_admin_client
                    admin_supabase = get_supabase_admin_client()
                    profile_res = admin_supabase.table("perfiles").select("email").ilike("username", username).execute()
                    if profile_res.data:
                        email = profile_res.data[0]["email"]
                except Exception as e:
                    print(f"Error buscando email por nombre en perfiles: {e}")
            
            auth_res = supabase.auth.sign_in_with_password({"email": email, "password": password})
            if auth_res and auth_res.user:
                user_id = auth_res.user.id
                # Obtener perfil del agente
                profile_res = supabase.table("perfiles").select("*, sucursales!perfiles_sucursal_id_fkey(nombre)").eq("id", user_id).execute()
                if profile_res.data:
                    profile = profile_res.data[0]
                    sucursal_data = profile.get("sucursales")
                    sucursal_nombre = sucursal_data.get("nombre") if isinstance(sucursal_data, dict) else None
                    rol = profile.get("rol")
                    display_name = profile.get("nombre") or profile.get("username") or (profile.get("email", "").split("@")[0].capitalize() if profile.get("email") else "Agente")
                    access_token = create_token(
                        payload={
                            "sub": user_id,
                            "nombre": display_name,
                            "email": profile.get("email"),
                            "rol": rol,
                            "sucursal_id": str(profile.get("sucursal_id")) if profile.get("sucursal_id") else None,
                            "sucursal_nombre": sucursal_nombre,
                            "type": "access"
                        },
                        expires_delta=timedelta(minutes=_ACCESS_TOKEN_MINUTES)
                    )
                    refresh_token = create_token(
                        payload={
                            "sub": user_id, 
                            "type": "refresh", 
                            "rol": rol,
                            "nombre": display_name,
                            "email": profile.get("email"),
                            "sucursal_id": str(profile.get("sucursal_id")) if profile.get("sucursal_id") else None,
                            "sucursal_nombre": sucursal_nombre
                        },
                        expires_delta=timedelta(days=_REFRESH_TOKEN_DAYS)
                    )
                    cookie_name = "otg_admin_refresh" if rol == "ADMIN_GLOBAL" else "otg_agent_refresh"
                    response.set_cookie(
                        key=cookie_name,
                        value=refresh_token,
                        httponly=True,
                        secure=_COOKIE_SECURE,
                        samesite="lax",
                        max_age=_REFRESH_TOKEN_DAYS * 24 * 60 * 60,
                        path="/api/auth"
                    )
                    return {
                        "access_token": access_token,
                        "username": display_name,
                        "rol": rol,
                        "sucursal_id": profile.get("sucursal_id")
                    }
        except Exception as e:
            print(f"Autenticación en Supabase falló, intentando fallback local. Detalle: {e}")
            
    # Fallback local (USERS_DB)
    if username in USERS_DB and USERS_DB[username] == password:
        rol = "ADMIN_GLOBAL" if username in ("admin", "uriel") else "AGENTE_SUCURSAL"
        display_name = username.capitalize()
        access_token = create_token(
            payload={
                "sub": username,
                "nombre": display_name,
                "email": f"{username}@onetrip.com",
                "rol": rol,
                "sucursal_id": None,
                "type": "access"
            },
            expires_delta=timedelta(minutes=_ACCESS_TOKEN_MINUTES)
        )
        refresh_token = create_token(
            payload={
                "sub": username, 
                "type": "refresh", 
                "rol": rol,
                "nombre": display_name,
                "email": f"{username}@onetrip.com"
            },
            expires_delta=timedelta(days=_REFRESH_TOKEN_DAYS)
        )
        
        cookie_name = "otg_admin_refresh" if rol == "ADMIN_GLOBAL" else "otg_agent_refresh"
        response.set_cookie(
            key=cookie_name,
            value=refresh_token,
            httponly=True,
            secure=_COOKIE_SECURE,
            samesite="lax",
            max_age=_REFRESH_TOKEN_DAYS * 24 * 60 * 60,
            path="/api/auth"
        )
        return {
            "access_token": access_token,
            "username": display_name,
            "rol": rol,
            "sucursal_id": None
        }
    else:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")

@router.post("/refresh")
def api_refresh(
    response: Response, 
    scope: str = "agent",
    otg_agent_refresh: str = Cookie(None),
    otg_admin_refresh: str = Cookie(None),
    refresh_token: str = Cookie(None)
):
    target_token = None
    if scope == "admin":
        target_token = otg_admin_refresh or refresh_token
    else:
        target_token = otg_agent_refresh or refresh_token

    if not target_token:
        raise HTTPException(status_code=401, detail="Token de refresco faltante")
    try:
        payload = decode_token(target_token)
        if payload.get("type") != "refresh":
            raise ValueError("Token no válido para refresco")
            
        username = payload.get("sub")
        is_uuid = len(str(username)) > 20 or "-" in str(username)
        
        token_nombre = payload.get("nombre")
        token_email = payload.get("email")
        token_sucursal_id = payload.get("sucursal_id")
        token_sucursal_nombre = payload.get("sucursal_nombre")
        
        nombre = token_nombre if (token_nombre and not (len(str(token_nombre)) > 20 or "-" in str(token_nombre))) else (None if is_uuid else str(username).capitalize())
        email = token_email or (f"{username}@onetrip.com" if not is_uuid else None)
        rol = payload.get("rol") or ("ADMIN_GLOBAL" if username in ("admin", "uriel") else "AGENTE_SUCURSAL")
        sucursal_id = token_sucursal_id
        sucursal_nombre = token_sucursal_nombre
        
        # Use get_supabase_admin_client to bypass RLS when looking up agent profile
        try:
            from app.routers.admin import get_supabase_admin_client
            admin_supabase = get_supabase_admin_client()
        except Exception:
            admin_supabase = None
            
        if admin_supabase and is_uuid:
            try:
                profile_res = admin_supabase.table("perfiles").select("*, sucursales!perfiles_sucursal_id_fkey(nombre)").eq("id", username).execute()
                if profile_res and hasattr(profile_res, "data") and profile_res.data:
                    profile = profile_res.data[0]
                    fetched_name = profile.get("nombre") or profile.get("username")
                    if fetched_name and not (len(str(fetched_name)) > 20 or "-" in str(fetched_name)):
                        nombre = fetched_name
                    elif profile.get("email"):
                        email = profile.get("email")
                        fetched_email_name = email.split("@")[0].capitalize()
                        if not nombre or len(str(nombre)) > 20 or "-" in str(nombre):
                            nombre = fetched_email_name
                    email = profile.get("email") or email
                    rol = profile.get("rol") or rol
                    sucursal_id = str(profile.get("sucursal_id")) if profile.get("sucursal_id") else sucursal_id
                    suc_data = profile.get("sucursales")
                    if isinstance(suc_data, dict):
                        sucursal_nombre = suc_data.get("nombre") or sucursal_nombre
            except Exception as e:
                print(f"Error refrescando perfil desde base de datos: {e}")
        
        # If nombre is still missing or a UUID, derive from email or token_nombre
        if not nombre or (len(str(nombre)) > 20 or "-" in str(nombre)):
            if email and "@" in str(email):
                nombre = str(email).split("@")[0].capitalize()
            elif token_nombre and not (len(str(token_nombre)) > 20 or "-" in str(token_nombre)):
                nombre = token_nombre
            else:
                nombre = "Agente" if username != "guest" else "Invitado"
                
        # Verificar coincidencia de scope con el rol obtenido
        if scope == "admin" and rol != "ADMIN_GLOBAL":
            raise ValueError("Token no corresponde a un perfil de administración")
        if scope == "agent" and rol == "ADMIN_GLOBAL":
            raise ValueError("Token de administrador no válido para sesión de agente")

        new_access_token = create_token(
            payload={
                "sub": username,
                "nombre": nombre,
                "email": email,
                "rol": rol,
                "sucursal_id": sucursal_id,
                "sucursal_nombre": sucursal_nombre,
                "type": "access"
            },
            expires_delta=timedelta(minutes=_ACCESS_TOKEN_MINUTES)
        )
        print(f"[AUTH REFRESH] sub={username}, nombre={nombre}, rol={rol}")
        return {
            "access_token": new_access_token,
            "username": nombre,
            "nombre": nombre,
            "rol": rol,
            "sucursal_id": sucursal_id,
            "sucursal_nombre": sucursal_nombre,
            "email": email,
        }
    except Exception as e:
        cookie_to_delete = "otg_admin_refresh" if scope == "admin" else "otg_agent_refresh"
        response.delete_cookie(key=cookie_to_delete, path="/api/auth")
        response.delete_cookie(key="refresh_token", path="/api/auth")
        raise HTTPException(status_code=401, detail=f"Sesión expirada o inválida: {str(e)}")

@router.post("/logout")
def api_logout(response: Response, scope: str = "agent"):
    response.delete_cookie(key="otg_agent_refresh", path="/api/auth")
    response.delete_cookie(key="otg_agent_refresh", path="/")
    response.delete_cookie(key="otg_admin_refresh", path="/api/auth")
    response.delete_cookie(key="otg_admin_refresh", path="/")
    response.delete_cookie(key="refresh_token", path="/api/auth")
    response.delete_cookie(key="refresh_token", path="/")
    return {"status": "success", "message": "Sesión cerrada correctamente."}

@router.post("/login-guest")
def api_login_guest(response: Response):
    access_token = create_token(
        payload={
            "sub": "guest", 
            "nombre": "Invitado",
            "email": "guest@onetrip.com",
            "rol": "AGENTE_SUCURSAL",
            "sucursal_id": None,
            "type": "access"
        },
        expires_delta=timedelta(minutes=_ACCESS_TOKEN_MINUTES)
    )
    refresh_token = create_token(
        payload={
            "sub": "guest", 
            "type": "refresh", 
            "rol": "AGENTE_SUCURSAL",
            "nombre": "Invitado",
            "email": "guest@onetrip.com"
        },
        expires_delta=timedelta(days=_REFRESH_TOKEN_DAYS)
    )
    
    response.set_cookie(
        key="otg_agent_refresh",
        value=refresh_token,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="lax",
        max_age=_REFRESH_TOKEN_DAYS * 24 * 60 * 60,
        path="/api/auth"
    )
    return {"access_token": access_token, "username": "guest"}


