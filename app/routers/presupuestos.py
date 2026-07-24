from fastapi import APIRouter, Depends, HTTPException
from app.routers.auth import get_current_active_agent, resolve_agent_names
from app.database import save_cotizacion_rapida, get_cotizaciones_rapidas, get_cotizacion_rapida_by_id, delete_cotizacion_rapida

router = APIRouter(prefix="/api/presupuestos", tags=["presupuestos"])

@router.post("")
@router.post("/")
def api_save_cotizacion_rapida(payload: dict, current_user: dict = Depends(get_current_active_agent)):
    """Saves a quick quote to Supabase, associating the branch and agent."""
    quote_id = payload.get("id")
    if quote_id:
        try:
            quote_id_typed = int(quote_id)
        except ValueError:
            quote_id_typed = quote_id
        existing = get_cotizacion_rapida_by_id(quote_id_typed)
        if existing:
            # Check sucursal isolation
            if current_user.get("rol") != "ADMIN_GLOBAL":
                existing_suc = existing.get("sucursal_id")
                user_suc = current_user.get("sucursal_id")
                if existing_suc and user_suc and str(existing_suc) != str(user_suc):
                    # Strip ID to force create a duplicate instead of updating unauthorized quote
                    payload.pop("id", None)

    payload["agente_id"] = current_user.get("id")
    payload["sucursal_id"] = current_user.get("sucursal_id")
    payload["agente_nombre"] = current_user.get("nombre")
    saved = save_cotizacion_rapida(payload)
    if not saved:
        raise HTTPException(status_code=500, detail="No se pudo guardar el presupuesto rápido en la base de datos.")
    return saved

@router.get("")
@router.get("/")
def api_get_cotizaciones_rapidas(current_user: dict = Depends(get_current_active_agent)):
    """Retrieves all quick quotes from the database, filtered by branch if applicable."""
    if current_user.get("rol") == "ADMIN_GLOBAL":
        quotes = get_cotizaciones_rapidas()
    else:
        sucursal_id = current_user.get("sucursal_id")
        if not sucursal_id:
            raise HTTPException(status_code=400, detail="El agente no tiene una sucursal asignada.")
        quotes = get_cotizaciones_rapidas(sucursal_id=sucursal_id)
    return resolve_agent_names(quotes, current_user)

@router.get("/{quote_id}")
def api_get_cotizacion_rapida(quote_id: str, current_user: dict = Depends(get_current_active_agent)):
    """Retrieves a single quick quote by ID and validates branch access."""
    try:
        quote_id_typed = int(quote_id)
    except ValueError:
        quote_id_typed = quote_id
    quote = get_cotizacion_rapida_by_id(quote_id_typed)
    if not quote:
        raise HTTPException(status_code=404, detail="Presupuesto rápido no encontrado.")
        
    # Check branch isolation
    if current_user.get("rol") != "ADMIN_GLOBAL":
        quote_suc = quote.get("sucursal_id")
        user_suc = current_user.get("sucursal_id")
        if quote_suc and user_suc and str(quote_suc) != str(user_suc):
            raise HTTPException(status_code=403, detail="No tienes permisos para acceder a este presupuesto rápido.")
            
    resolved = resolve_agent_names([quote], current_user)
    return resolved[0]

@router.delete("/{quote_id}")
def api_delete_cotizacion_rapida(quote_id: str, current_user: dict = Depends(get_current_active_agent)):
    """Deletes a quick quote by ID and validates branch access."""
    try:
        quote_id_typed = int(quote_id)
    except ValueError:
        quote_id_typed = quote_id

    quote = get_cotizacion_rapida_by_id(quote_id_typed)
    if not quote:
        raise HTTPException(status_code=404, detail="Presupuesto rápido no encontrado.")
    
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

    success = delete_cotizacion_rapida(quote_id_typed)
    if not success:
        raise HTTPException(status_code=500, detail="No se pudo eliminar el presupuesto rápido de la base de datos.")
    return {"status": "success", "message": "Presupuesto rápido eliminado con éxito."}

@router.post("/{quote_id}/duplicar")
def api_duplicate_cotizacion_rapida(quote_id: str, current_user: dict = Depends(get_current_active_agent)):
    """Duplicates a quick quote with 'Copia de ' title prefix and fresh timestamps."""
    from datetime import datetime
    try:
        quote_id_typed = int(quote_id)
    except ValueError:
        quote_id_typed = quote_id

    existing = get_cotizacion_rapida_by_id(quote_id_typed)
    if not existing:
        raise HTTPException(status_code=404, detail="Presupuesto rápido no encontrado.")
    
    if current_user.get("rol") != "ADMIN_GLOBAL":
        quote_suc = existing.get("sucursal_id")
        user_suc = current_user.get("sucursal_id")
        if quote_suc and user_suc and str(quote_suc) != str(user_suc):
            raise HTTPException(status_code=403, detail="No tienes permisos para duplicar este presupuesto rápido.")

    cloned_payload = existing.copy()
    cloned_payload.pop("id", None)
    cloned_payload.pop("created_at", None)
    cloned_payload.pop("updated_at", None)

    original_nombre = cloned_payload.get("pasajero_nombre") or cloned_payload.get("nombre_pax") or ""
    if not str(original_nombre).startswith("Copia de "):
        cloned_payload["pasajero_nombre"] = f"Copia de {original_nombre}"
    else:
        cloned_payload["pasajero_nombre"] = original_nombre

    cloned_payload["agente_id"] = current_user.get("id")
    cloned_payload["sucursal_id"] = current_user.get("sucursal_id")
    cloned_payload["agente_nombre"] = current_user.get("nombre")
    cloned_payload["created_at"] = datetime.utcnow().isoformat()

    saved = save_cotizacion_rapida(cloned_payload)
    if not saved:
        raise HTTPException(status_code=500, detail="No se pudo duplicar el presupuesto rápido de la base de datos.")
    return saved


