from fastapi import APIRouter, Depends, HTTPException
from app.routers.auth import get_current_active_agent
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
                if str(existing.get("sucursal_id")) != str(current_user.get("sucursal_id")):
                    # Strip ID to force create a duplicate instead of updating unauthorized quote
                    payload.pop("id", None)

    payload["agente_id"] = current_user.get("id")
    payload["agente_nombre"] = current_user.get("nombre")
    payload["sucursal_id"] = current_user.get("sucursal_id")
    saved = save_cotizacion_rapida(payload)
    if not saved:
        raise HTTPException(status_code=500, detail="No se pudo guardar el presupuesto rápido en la base de datos.")
    return saved

@router.get("")
@router.get("/")
def api_get_cotizaciones_rapidas(current_user: dict = Depends(get_current_active_agent)):
    """Retrieves all quick quotes from the database, filtered by branch if applicable."""
    if current_user.get("rol") == "ADMIN_GLOBAL":
        return get_cotizaciones_rapidas()
    
    sucursal_id = current_user.get("sucursal_id")
    return get_cotizaciones_rapidas(sucursal_id=sucursal_id)

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
        
    # Check branch isolation (only enforce if both user and quote have sucursal_id)
    if current_user.get("rol") != "ADMIN_GLOBAL":
        user_suc = current_user.get("sucursal_id")
        quote_suc = quote.get("sucursal_id")
        if user_suc and quote_suc and str(quote_suc) != str(user_suc):
            raise HTTPException(status_code=403, detail="No tienes permisos para acceder a este presupuesto rápido.")
            
    return quote

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
        if str(quote.get("sucursal_id")) != str(current_user.get("sucursal_id")):
            raise HTTPException(status_code=403, detail="No tienes permisos para eliminar este presupuesto rápido.")

    success = delete_cotizacion_rapida(quote_id_typed)
    if not success:
        raise HTTPException(status_code=500, detail="No se pudo eliminar el presupuesto rápido de la base de datos.")
    return {"status": "success", "message": "Presupuesto rápido eliminado con éxito."}

