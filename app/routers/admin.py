import os
from fastapi import APIRouter, Depends, HTTPException
from app.routers.auth import verify_admin_global
from app.database import get_supabase_client
from supabase import create_client

router = APIRouter(prefix="/api/admin", tags=["admin"])

def get_supabase_admin_client():
    """
    Initializes a Supabase client using the SERVICE_ROLE_KEY
    to perform administrative actions like user creation.
    """
    from dotenv import load_dotenv
    load_dotenv(override=True)
    url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not service_key:
        # Fallback to standard client (which will fail auth admin operations but work on tables if policies allow)
        return get_supabase_client()
        
    try:
        return create_client(url, service_key)
    except Exception as e:
        print(f"Error initializing Supabase Admin client: {e}")
        return get_supabase_client()

# ── ENDPOINTS DE SUCURSALES ───────────────────────────────────────────────────

@router.get("/sucursales")
def get_sucursales(current_admin: dict = Depends(verify_admin_global)):
    client = get_supabase_admin_client()
    if not client:
        raise HTTPException(status_code=500, detail="Supabase client not configured.")
        
    try:
        res = client.table("sucursales").select("*").order("nombre").execute()
        return res.data if res and hasattr(res, "data") else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar sucursales: {str(e)}")

@router.post("/sucursales")
def create_sucursal(payload: dict, current_admin: dict = Depends(verify_admin_global)):
    nombre = payload.get("nombre", "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre de la sucursal es obligatorio.")
        
    client = get_supabase_admin_client()
    if not client:
        raise HTTPException(status_code=500, detail="Supabase client not configured.")
        
    try:
        res = client.table("sucursales").insert({"nombre": nombre}).execute()
        if res and hasattr(res, "data") and res.data:
            return res.data[0]
        raise HTTPException(status_code=400, detail="No se pudo registrar la sucursal.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al registrar sucursal: {str(e)}")

@router.delete("/sucursales/{sucursal_id}")
def delete_sucursal(sucursal_id: str, current_admin: dict = Depends(verify_admin_global)):
    client = get_supabase_admin_client()
    if not client:
        raise HTTPException(status_code=500, detail="Supabase client not configured.")
        
    try:
        client.table("sucursales").delete().eq("id", sucursal_id).execute()
        return {"status": "success", "message": "Sucursal eliminada correctamente."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar sucursal: {str(e)}")

# ── ENDPOINTS DE AGENTES ──────────────────────────────────────────────────────

@router.get("/agentes")
def get_agentes(current_admin: dict = Depends(verify_admin_global)):
    client = get_supabase_admin_client()
    if not client:
        raise HTTPException(status_code=500, detail="Supabase client not configured.")
        
    try:
        # Traer perfiles de los agentes con los datos de sus sucursales
        res = client.table("perfiles").select("*, sucursales(nombre)").order("nombre").execute()
        return res.data if res and hasattr(res, "data") else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar agentes: {str(e)}")

@router.post("/agentes")
def create_agente(payload: dict, current_admin: dict = Depends(verify_admin_global)):
    nombre = payload.get("nombre", "").strip()
    username_val = payload.get("username", "").strip().lower()
    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "")
    rol = payload.get("rol", "AGENTE_SUCURSAL")
    sucursal_id = payload.get("sucursal_id")
    
    if not nombre or not username_val or not email or not password:
        raise HTTPException(status_code=400, detail="Nombre completo, nombre de usuario, email y contraseña son obligatorios.")
        
    if rol == "AGENTE_SUCURSAL" and not sucursal_id:
        raise HTTPException(status_code=400, detail="Los agentes de sucursal deben pertenecer a una sucursal.")

    # Requerir SERVICE_ROLE_KEY para la creación de usuarios en Supabase Auth
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not service_key:
        raise HTTPException(
            status_code=501, 
            detail="La variable SUPABASE_SERVICE_ROLE_KEY no está configurada en el servidor. No se pueden registrar usuarios de forma remota sin permisos de servicio."
        )
        
    admin_client = get_supabase_admin_client()
    
    # Verificar que el nombre de usuario no esté registrado por otro agente
    try:
        user_check = admin_client.table("perfiles").select("id").ilike("username", username_val).execute()
        if user_check and hasattr(user_check, "data") and user_check.data:
            raise HTTPException(status_code=400, detail="El nombre de usuario ya está registrado por otro agente de viajes.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error checking username existence: {e}")

    try:
        # Configurar atributos de creación del usuario en Supabase Auth
        user_meta = {
            "nombre": nombre,
            "username": username_val,
            "contrasena": password,
            "rol": rol,
            "sucursal_id": sucursal_id
        }
        
        # Crear usuario en Supabase Auth
        auth_res = admin_client.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": user_meta,
            "app_metadata": {"rol": rol, "sucursal_id": sucursal_id}
        })
        
        if not auth_res or not auth_res.user:
            raise HTTPException(status_code=400, detail="No se pudo registrar el agente en Supabase Auth.")
            
        user_id = auth_res.user.id
        
        # El trigger on_auth_user_created en PostgreSQL insertará automáticamente la fila en public.perfiles.
        # Sin embargo, devolvemos el perfil para confirmar la operación
        # Esperar 0.5s o consultar directamente
        import time
        time.sleep(0.5)
        
        client = get_supabase_admin_client()
        profile_res = client.table("perfiles").select("*, sucursales(nombre)").eq("id", user_id).execute()
        if profile_res and hasattr(profile_res, "data") and profile_res.data:
            return profile_res.data[0]
            
        return {
            "id": user_id,
            "nombre": nombre,
            "email": email,
            "rol": rol,
            "sucursal_id": sucursal_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al crear agente: {str(e)}")

@router.delete("/agentes/{agente_id}")
def delete_agente(agente_id: str, current_admin: dict = Depends(verify_admin_global)):
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not service_key:
        raise HTTPException(
            status_code=501, 
            detail="La variable SUPABASE_SERVICE_ROLE_KEY no está configurada en el servidor. No se pueden eliminar usuarios."
        )
        
    admin_client = get_supabase_admin_client()
    try:
        # Eliminar de Supabase Auth (eliminará en cascada el perfil por la FK REFERENCES auth.users)
        admin_client.auth.admin.delete_user(agente_id)
        return {"status": "success", "message": "Agente eliminado correctamente del sistema."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar agente: {str(e)}")
