from fastapi import APIRouter, Depends, HTTPException
from app.routers.auth import verify_agent_user
from app.database import save_cotizacion_rapida

router = APIRouter(prefix="/api/presupuestos", tags=["presupuestos"])

@router.post("")
@router.post("/")
def api_save_cotizacion_rapida(payload: dict, current_user: str = Depends(verify_agent_user)):
    """Saves a quick quote to Supabase."""
    payload["agente_id"] = current_user
    saved = save_cotizacion_rapida(payload)
    if not saved:
        raise HTTPException(status_code=500, detail="No se pudo guardar el presupuesto rápido en la base de datos.")
    return saved
