import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from app.routers.auth import get_current_user_token, get_current_franchise_owner
from app.database import get_supabase_client

router = APIRouter(tags=["user_franchise"])

def get_supabase_admin_client():
    """Initializes a Supabase client using SERVICE_ROLE_KEY for admin operations."""
    from dotenv import load_dotenv
    load_dotenv(override=True)
    url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_key:
        return get_supabase_client()
    try:
        from supabase import create_client
        return create_client(url, service_key)
    except Exception as e:
        print(f"Error initializing Supabase Admin client: {e}")
        return get_supabase_client()

# ── USER PROFILE ENDPOINTS ───────────────────────────────────────────────────

@router.get("/api/user/profile")
def get_user_profile(current_user: dict = Depends(get_current_user_token)):
    user_id = current_user.get("id")
    if not user_id or user_id == "guest":
        return {
            "id": "guest",
            "nombre": "Invitado",
            "apellido": "",
            "email": "guest@onetrip.com",
            "telefono": "",
            "color_tag": "#3b82f6",
            "tag_color": "#3b82f6",
            "rol": "AGENTE_SUCURSAL",
            "sucursal_id": None,
            "franchise_id": None
        }

    client = get_supabase_client()
    if not client:
        raise HTTPException(status_code=500, detail="Base de datos no disponible.")

    try:
        res = client.table("perfiles").select("*").eq("id", user_id).execute()
        if res and hasattr(res, "data") and res.data:
            profile = res.data[0]
            tag_col = profile.get("color_tag") or profile.get("tag_color") or "#3b82f6"
            f_id = profile.get("franchise_id") or profile.get("sucursal_id")
            return {
                "id": profile.get("id"),
                "nombre": profile.get("nombre", ""),
                "apellido": profile.get("apellido", ""),
                "email": profile.get("email", ""),
                "telefono": profile.get("telefono", ""),
                "color_tag": tag_col,
                "tag_color": tag_col,
                "rol": profile.get("rol", "AGENTE_SUCURSAL"),
                "sucursal_id": f_id,
                "franchise_id": f_id,
                "estado": profile.get("estado", "Activo")
            }
        
        # Fallback if profile row not found yet
        return {
            "id": user_id,
            "nombre": current_user.get("nombre", ""),
            "apellido": "",
            "email": current_user.get("email", ""),
            "telefono": "",
            "color_tag": "#3b82f6",
            "tag_color": "#3b82f6",
            "rol": current_user.get("rol", "AGENTE_SUCURSAL"),
            "sucursal_id": current_user.get("sucursal_id"),
            "franchise_id": current_user.get("sucursal_id"),
            "estado": "Activo"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener perfil: {str(e)}")

@router.put("/api/user/profile")
def update_user_profile(payload: dict, current_user: dict = Depends(get_current_user_token)):
    user_id = current_user.get("id")
    if not user_id or user_id == "guest":
        raise HTTPException(status_code=403, detail="Las cuentas de invitado no pueden modificar perfil.")

    nombre = payload.get("nombre", "").strip()
    apellido = payload.get("apellido", "").strip()
    telefono = payload.get("telefono", "").strip()
    contrasena = payload.get("contrasena", "")
    color_tag = payload.get("color_tag") or payload.get("tag_color") or "#3b82f6"

    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio.")

    if contrasena:
        if len(contrasena) < 6:
            raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 6 caracteres por seguridad.")

    client = get_supabase_admin_client()
    if not client:
        client = get_supabase_client()
    if not client:
        raise HTTPException(status_code=500, detail="Base de datos no disponible.")

    try:
        update_data = {
            "nombre": nombre,
            "apellido": apellido,
            "telefono": telefono,
            "color_tag": color_tag,
            "tag_color": color_tag
        }
        if contrasena:
            update_data["contrasena"] = contrasena

        res = client.table("perfiles").update(update_data).eq("id", user_id).execute()

        # Update in Supabase Auth if password changed
        if contrasena and hasattr(client, "auth") and hasattr(client.auth, "admin"):
            try:
                client.auth.admin.update_user_by_id(user_id, {
                    "password": contrasena,
                    "user_metadata": {
                        "nombre": nombre,
                        "apellido": apellido,
                        "telefono": telefono,
                        "color_tag": color_tag
                    }
                })
            except Exception as auth_err:
                print(f"Advertencia al actualizar contraseña en Auth: {auth_err}")

        # Fetch updated profile
        updated_res = client.table("perfiles").select("*").eq("id", user_id).execute()
        updated_profile = updated_res.data[0] if (updated_res and hasattr(updated_res, "data") and updated_res.data) else update_data

        return {
            "status": "success",
            "message": "Perfil actualizado correctamente.",
            "profile": {
                "id": user_id,
                "nombre": updated_profile.get("nombre", nombre),
                "apellido": updated_profile.get("apellido", apellido),
                "email": updated_profile.get("email", current_user.get("email")),
                "telefono": updated_profile.get("telefono", telefono),
                "color_tag": updated_profile.get("color_tag", color_tag),
                "tag_color": updated_profile.get("color_tag", color_tag),
                "rol": updated_profile.get("rol", current_user.get("rol")),
                "franchise_id": updated_profile.get("franchise_id") or updated_profile.get("sucursal_id")
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar el perfil: {str(e)}")

# ── FRANCHISE ADMINISTRATION ENDPOINTS ───────────────────────────────────────

@router.get("/api/franchise/agents")
def get_franchise_agents(current_owner: dict = Depends(get_current_franchise_owner)):
    franchise_id = current_owner.get("franchise_id") or current_owner.get("sucursal_id")
    rol = current_owner.get("rol")

    client = get_supabase_admin_client()
    if not client:
        client = get_supabase_client()
    if not client:
        raise HTTPException(status_code=500, detail="Base de datos no disponible.")

    try:
        query = client.table("perfiles").select("*, sucursales!perfiles_sucursal_id_fkey(nombre)")
        if franchise_id and rol != "ADMIN_GLOBAL":
            query = query.or_(f"sucursal_id.eq.{franchise_id},franchise_id.eq.{franchise_id}")
            
        res = query.order("nombre").execute()
        raw_agents = res.data if res and hasattr(res, "data") else []

        mapped = []
        for a in raw_agents:
            t_color = a.get("color_tag") or a.get("tag_color") or "#3b82f6"
            suc_data = a.get("sucursales")
            suc_nombre = suc_data.get("nombre") if isinstance(suc_data, dict) else None
            mapped.append({
                "id": a.get("id"),
                "nombre": a.get("nombre", ""),
                "apellido": a.get("apellido", ""),
                "email": a.get("email", ""),
                "telefono": a.get("telefono", ""),
                "rol": a.get("rol", "AGENTE_SUCURSAL"),
                "color_tag": t_color,
                "tag_color": t_color,
                "estado": a.get("estado", "Activo"),
                "sucursal_id": a.get("sucursal_id") or a.get("franchise_id"),
                "sucursal_nombre": suc_nombre,
                "created_at": a.get("created_at")
            })
        return mapped
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener agentes de la franquicia: {str(e)}")

@router.post("/api/franchise/agents")
def create_franchise_agent(payload: dict, current_owner: dict = Depends(get_current_franchise_owner)):
    email = payload.get("email", "").strip().lower()
    nombre = payload.get("nombre", "").strip()
    apellido = payload.get("apellido", "").strip()
    telefono = payload.get("telefono", "").strip()
    rol = payload.get("rol", "AGENTE_SUCURSAL")
    color_tag = payload.get("color_tag") or payload.get("tag_color") or "#3b82f6"
    contrasena = payload.get("contrasena", "onetrip2026")

    if not email or not nombre:
        raise HTTPException(status_code=400, detail="El email y el nombre del agente son obligatorios.")

    owner_franchise_id = current_owner.get("franchise_id") or current_owner.get("sucursal_id")
    target_franchise_id = payload.get("franchise_id") or payload.get("sucursal_id") or owner_franchise_id

    # Non-global admins can only add agents to their own franchise
    if current_owner.get("rol") != "ADMIN_GLOBAL" and owner_franchise_id:
        target_franchise_id = owner_franchise_id

    client = get_supabase_admin_client()
    if not client:
        client = get_supabase_client()
    if not client:
        raise HTTPException(status_code=500, detail="Base de datos no disponible.")

    # Check if email exists
    try:
        email_check = client.table("perfiles").select("id").ilike("email", email).execute()
        if email_check and hasattr(email_check, "data") and email_check.data:
            raise HTTPException(status_code=400, detail="El correo electrónico ya está registrado por otro agente.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error comprobando existencia de email: {e}")

    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    username_val = payload.get("username") or email.split("@")[0].lower()

    if service_key and hasattr(client, "auth") and hasattr(client.auth, "admin"):
        try:
            auth_res = client.auth.admin.create_user({
                "email": email,
                "password": contrasena,
                "email_confirm": True,
                "user_metadata": {
                    "nombre": nombre,
                    "apellido": apellido,
                    "telefono": telefono,
                    "username": username_val,
                    "rol": rol,
                    "sucursal_id": target_franchise_id,
                    "franchise_id": target_franchise_id,
                    "color_tag": color_tag,
                    "tag_color": color_tag
                },
                "app_metadata": {
                    "rol": rol,
                    "sucursal_id": target_franchise_id
                }
            })
            if auth_res and auth_res.user:
                new_id = auth_res.user.id
                # Update perfiles details
                import time
                time.sleep(0.3)
                client.table("perfiles").update({
                    "nombre": nombre,
                    "apellido": apellido,
                    "telefono": telefono,
                    "color_tag": color_tag,
                    "tag_color": color_tag,
                    "franchise_id": target_franchise_id,
                    "sucursal_id": target_franchise_id,
                    "estado": "Activo"
                }).eq("id", new_id).execute()

                return {
                    "status": "success",
                    "message": "Agente creado y vinculado exitosamente.",
                    "agent": {
                        "id": new_id,
                        "nombre": nombre,
                        "apellido": apellido,
                        "email": email,
                        "telefono": telefono,
                        "rol": rol,
                        "color_tag": color_tag,
                        "tag_color": color_tag,
                        "sucursal_id": target_franchise_id,
                        "estado": "Activo"
                    }
                }
        except Exception as e:
            print(f"Auth create_user error, fallbacking to direct insert: {e}")

    # Fallback: direct insert to perfiles
    try:
        import uuid
        new_id = str(uuid.uuid4())
        insert_payload = {
            "id": new_id,
            "nombre": nombre,
            "apellido": apellido,
            "username": username_val,
            "email": email,
            "contrasena": contrasena,
            "telefono": telefono,
            "rol": rol,
            "sucursal_id": target_franchise_id,
            "franchise_id": target_franchise_id,
            "color_tag": color_tag,
            "tag_color": color_tag,
            "estado": "Activo"
        }
        res = client.table("perfiles").insert(insert_payload).execute()
        if res and hasattr(res, "data") and res.data:
            return {
                "status": "success",
                "message": "Agente creado exitosamente.",
                "agent": res.data[0]
            }
        raise HTTPException(status_code=400, detail="No se pudo registrar el agente.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al crear el agente: {str(e)}")
