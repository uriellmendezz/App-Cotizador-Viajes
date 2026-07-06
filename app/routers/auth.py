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

@router.post("/login")
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

@router.post("/refresh")
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

@router.post("/logout")
def api_logout(response: Response):
    response.delete_cookie(key="refresh_token", path="/api/auth")
    return {"status": "success"}

@router.post("/login-guest")
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
