from fastapi import APIRouter, Depends, HTTPException
from app.routers.auth import verify_agent_user
from app.database import save_cotizacion_rapida, get_cotizaciones_rapidas, get_cotizacion_rapida_by_id, delete_cotizacion_rapida

router = APIRouter(prefix="/api/presupuestos", tags=["presupuestos"])

@router.post("")
@router.post("/")
def api_save_cotizacion_rapida(payload: dict, current_user: str = Depends(verify_agent_user)):
    """Saves a quick quote to Supabase."""
    quote_id = payload.get("id")
    if quote_id:
        try:
            quote_id_typed = int(quote_id)
        except ValueError:
            quote_id_typed = quote_id
        existing = get_cotizacion_rapida_by_id(quote_id_typed)
        if existing:
            owner = existing.get("agente_id") or ""
            if owner.lower() != current_user.lower():
                # Strip the ID to force creation of a duplicate!
                payload.pop("id", None)

    payload["agente_id"] = current_user
    saved = save_cotizacion_rapida(payload)
    if not saved:
        raise HTTPException(status_code=500, detail="No se pudo guardar el presupuesto rápido en la base de datos.")
    return saved

@router.get("")
@router.get("/")
def api_get_cotizaciones_rapidas(current_user: str = Depends(verify_agent_user)):
    """Retrieves all quick quotes from the database."""
    return get_cotizaciones_rapidas()

@router.get("/{quote_id}")
def api_get_cotizacion_rapida(quote_id: str, current_user: str = Depends(verify_agent_user)):
    """Retrieves a single quick quote by ID."""
    try:
        quote_id_typed = int(quote_id)
    except ValueError:
        quote_id_typed = quote_id
    quote = get_cotizacion_rapida_by_id(quote_id_typed)
    if not quote:
        raise HTTPException(status_code=404, detail="Presupuesto rápido no encontrado.")
    return quote

@router.delete("/{quote_id}")
def api_delete_cotizacion_rapida(quote_id: str, current_user: str = Depends(verify_agent_user)):
    """Deletes a quick quote by ID."""
    try:
        quote_id_typed = int(quote_id)
    except ValueError:
        quote_id_typed = quote_id

    quote = get_cotizacion_rapida_by_id(quote_id_typed)
    if not quote:
        raise HTTPException(status_code=404, detail="Presupuesto rápido no encontrado.")
    
    owner = quote.get("agente_id") or ""
    if owner.lower() != current_user.lower():
        raise HTTPException(status_code=403, detail="No tienes permisos para eliminar este presupuesto rápido.")

    success = delete_cotizacion_rapida(quote_id_typed)
    if not success:
        raise HTTPException(status_code=500, detail="No se pudo eliminar el presupuesto rápido de la base de datos.")
    return {"status": "success", "message": "Presupuesto rápido eliminado con éxito."}
