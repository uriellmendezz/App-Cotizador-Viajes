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

def get_current_active_agent(authorization: str = Header(None)) -> dict:
    """
    Dependencia de FastAPI para extraer la información detallada del agente activo
    (sub, nombre, email, rol, sucursal_id) desde el token JWT.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autorizado. Token de sesión faltante.")
    token = authorization.split(" ")[1]
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Token no apto para acceso")
        
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
            "rol": payload.get("rol", "AGENTE_SUCURSAL"),
            "sucursal_id": payload.get("sucursal_id")
        }
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Sesión expirada o inválida: {str(e)}")

def verify_admin_global(current_agent: dict = Depends(get_current_active_agent)) -> dict:
    """Verifica que el agente tenga el rol ADMIN_GLOBAL."""
    if current_agent.get("rol") != "ADMIN_GLOBAL":
        raise HTTPException(status_code=403, detail="Acceso denegado. Se requieren permisos de Administrador Global.")
    return current_agent

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
                profile_res = supabase.table("perfiles").select("*, sucursales(nombre)").eq("id", user_id).execute()
                if profile_res.data:
                    profile = profile_res.data[0]
                    sucursal_data = profile.get("sucursales")
                    sucursal_nombre = sucursal_data.get("nombre") if isinstance(sucursal_data, dict) else None
                    access_token = create_token(
                        payload={
                            "sub": user_id,
                            "nombre": profile.get("nombre"),
                            "email": profile.get("email"),
                            "rol": profile.get("rol"),
                            "sucursal_id": str(profile.get("sucursal_id")) if profile.get("sucursal_id") else None,
                            "sucursal_nombre": sucursal_nombre,
                            "type": "access"
                        },
                        expires_delta=timedelta(minutes=60)
                    )
                    refresh_token = create_token(
                        payload={"sub": user_id, "type": "refresh"},
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
                    return {
                        "access_token": access_token,
                        "username": profile.get("nombre"),
                        "rol": profile.get("rol"),
                        "sucursal_id": profile.get("sucursal_id")
                    }
        except Exception as e:
            print(f"Autenticación en Supabase falló, intentando fallback local. Detalle: {e}")
            
    # Fallback local (USERS_DB)
    if username in USERS_DB and USERS_DB[username] == password:
        rol = "ADMIN_GLOBAL" if username in ("admin", "uriel") else "AGENTE_SUCURSAL"
        access_token = create_token(
            payload={
                "sub": username,
                "nombre": username.capitalize(),
                "email": f"{username}@onetrip.com",
                "rol": rol,
                "sucursal_id": None,
                "type": "access"
            },
            expires_delta=timedelta(minutes=60)
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
        return {
            "access_token": access_token,
            "username": username.capitalize(),
            "rol": rol,
            "sucursal_id": None
        }
    else:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")

@router.post("/refresh")
def api_refresh(response: Response, refresh_token: str = Cookie(None)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Token de refresco faltante")
    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError("Token no válido para refresco")
            
        username = payload.get("sub")
        # Si es UUID, buscar en Supabase, sino fallback
        from app.database import get_supabase_client
        supabase = get_supabase_client()
        
        nombre = username.capitalize()
        email = f"{username}@onetrip.com"
        rol = "ADMIN_GLOBAL" if username in ("admin", "uriel") else "AGENTE_SUCURSAL"
        sucursal_id = None
        
        if supabase and len(username) > 20: # Probable UUID de Supabase
            try:
                profile_res = supabase.table("perfiles").select("*").eq("id", username).execute()
                if profile_res.data:
                    profile = profile_res.data[0]
                    nombre = profile.get("nombre")
                    email = profile.get("email")
                    rol = profile.get("rol")
                    sucursal_id = str(profile.get("sucursal_id")) if profile.get("sucursal_id") else None
            except Exception as e:
                print(f"Error refrescando perfil desde base de datos: {e}")
                
        new_access_token = create_token(
            payload={
                "sub": username,
                "nombre": nombre,
                "email": email,
                "rol": rol,
                "sucursal_id": sucursal_id,
                "type": "access"
            },
            expires_delta=timedelta(minutes=60)
        )
        return {"access_token": new_access_token, "username": nombre}
    except Exception as e:
        response.delete_cookie(key="refresh_token", path="/api/auth")
        raise HTTPException(status_code=401, detail=f"Sesión expirada o inválida: {str(e)}")

@router.post("/logout")
def api_logout(response: Response):
    response.delete_cookie(key="refresh_token", path="/api/auth")
    return {"status": "success"}

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
        expires_delta=timedelta(minutes=60)
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

