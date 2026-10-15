import os
import re
from fastapi import APIRouter, Depends, HTTPException
from app.routers.auth import get_current_active_agent
from app.database import (
    TABLE_HOTELES, TABLE_PAQUETES, TABLE_AEROLINEAS,
    list_rows, get_row_by_id, save_row, delete_row
)

router = APIRouter(prefix="/api", tags=["catalogo"])

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

MAX_FOTOS_HOTEL = 6
MAX_DESCRIPCION_HOTEL = 200
DATA_IMAGE_RE = re.compile(r"^data:image/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$")

# Logos incluidos en el repositorio, que el agente puede elegir en vez de subir uno
LOGOS_DIR = os.path.join(BASE_DIR, "assets", "logos_aerolineas")
LOGO_PATH_RE = re.compile(r"^/assets/logos_aerolineas/[A-Za-z0-9_.-]+$")

def _is_data_image(value) -> bool:
    return isinstance(value, str) and bool(DATA_IMAGE_RE.match(value))


def _typed_id(row_id: str):
    try:
        return int(row_id)
    except ValueError:
        return row_id

def _require_agent(current_user: dict):
    """Guests cannot manage the hotel catalog nor promotional packages."""
    if current_user.get("id") == "guest":
        raise HTTPException(status_code=403, detail="Esta sección está disponible solo para agentes.")

def _check_scope(row: dict, current_user: dict, entity: str):
    """Validates that the row belongs to the user's branch (or to the user when it has no branch)."""
    user_suc = current_user.get("sucursal_id")
    row_suc = row.get("sucursal_id")
    if user_suc:
        if row_suc and str(row_suc) != str(user_suc):
            raise HTTPException(status_code=403, detail=f"No tienes permisos para acceder a este {entity}.")
    elif str(row.get("agente_id") or "") != str(current_user.get("id") or ""):
        raise HTTPException(status_code=403, detail=f"No tienes permisos para acceder a este {entity}.")

def _get_scoped_row(table: str, row_id: str, current_user: dict, entity: str) -> dict:
    row = get_row_by_id(table, _typed_id(row_id))
    if not row:
        raise HTTPException(status_code=404, detail=f"{entity.capitalize()} no encontrado.")
    _check_scope(row, current_user, entity)
    return row

def _ownership_fields(current_user: dict) -> dict:
    return {
        "sucursal_id": current_user.get("sucursal_id"),
        "agente_id": current_user.get("id"),
        "agente_nombre": current_user.get("nombre"),
    }


# ──────────────────────────────────────────────────────────────────────────────
# HOTELES (Configuración > Catálogo de Hoteles)
# ──────────────────────────────────────────────────────────────────────────────

def _normalize_hotel(payload: dict) -> dict:
    nombre = str(payload.get("nombre") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre del hotel es obligatorio.")
    try:
        estrellas = int(payload.get("estrellas") or 4)
    except (TypeError, ValueError):
        estrellas = 4
    fotos = [f for f in (payload.get("fotos") or []) if _is_data_image(f)]
    return {
        "nombre": nombre,
        "destino": str(payload.get("destino") or "").strip(),
        "estrellas": min(5, max(1, estrellas)),
        "regimen": str(payload.get("regimen") or "").strip(),
        "habitacion": str(payload.get("habitacion") or "").strip(),
        "descripcion": str(payload.get("descripcion") or "").strip()[:MAX_DESCRIPCION_HOTEL],
        "fotos": fotos[:MAX_FOTOS_HOTEL],
    }

def _hotel_summary(row: dict) -> dict:
    """List view: only the cover photo travels to the client to keep the payload light."""
    fotos = row.get("fotos") or []
    summary = {k: v for k, v in row.items() if k != "fotos"}
    summary["portada"] = fotos[0] if fotos else ""
    summary["total_fotos"] = len(fotos)
    return summary

@router.get("/hoteles")
def api_list_hoteles(current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    rows = list_rows(TABLE_HOTELES, current_user.get("sucursal_id"), current_user.get("id"))
    return [_hotel_summary(r) for r in rows]

@router.get("/hoteles/{hotel_id}")
def api_get_hotel(hotel_id: str, current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    return _get_scoped_row(TABLE_HOTELES, hotel_id, current_user, "hotel")

@router.post("/hoteles")
def api_create_hotel(payload: dict, current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    data = _normalize_hotel(payload)
    data.update(_ownership_fields(current_user))
    saved = save_row(TABLE_HOTELES, data)
    if not saved:
        raise HTTPException(status_code=500, detail="No se pudo guardar el hotel. Verifique que la tabla 'hoteles_catalogo' exista en la base de datos.")
    return saved

@router.put("/hoteles/{hotel_id}")
def api_update_hotel(hotel_id: str, payload: dict, current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    existing = _get_scoped_row(TABLE_HOTELES, hotel_id, current_user, "hotel")
    saved = save_row(TABLE_HOTELES, _normalize_hotel(payload), existing["id"])
    if not saved:
        raise HTTPException(status_code=500, detail="No se pudo actualizar el hotel.")
    return saved

@router.delete("/hoteles/{hotel_id}")
def api_delete_hotel(hotel_id: str, current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    existing = _get_scoped_row(TABLE_HOTELES, hotel_id, current_user, "hotel")
    if not delete_row(TABLE_HOTELES, existing["id"]):
        raise HTTPException(status_code=500, detail="No se pudo eliminar el hotel.")
    return {"status": "success", "message": "Hotel eliminado con éxito."}


# ──────────────────────────────────────────────────────────────────────────────
# PAQUETES PROMOCIONALES (Redes Sociales)
# ──────────────────────────────────────────────────────────────────────────────

def _normalize_paquete(payload: dict) -> dict:
    data = dict(payload.get("data")) if isinstance(payload.get("data"), dict) else {}
    if data.get("hotel_foto") and not _is_data_image(data["hotel_foto"]):
        data["hotel_foto"] = ""
    titulo = str(payload.get("titulo") or data.get("titulo") or "").strip()
    if not titulo:
        raise HTTPException(status_code=400, detail="El título del paquete es obligatorio.")
    try:
        precio_persona = float(payload.get("precio_persona") or 0)
    except (TypeError, ValueError):
        precio_persona = 0.0
    return {
        "titulo": titulo,
        "destino": str(payload.get("destino") or data.get("destino") or "").strip(),
        "moneda": str(payload.get("moneda") or data.get("moneda") or "USD"),
        "precio_persona": precio_persona,
        "data": data,
    }

def _paquete_summary(row: dict) -> dict:
    """List view: drops the full form payload, keeping only what the cards need."""
    data = row.get("data") or {}
    summary = {k: v for k, v in row.items() if k != "data"}
    summary["portada"] = data.get("hotel_foto") or ""
    summary["hotel_nombre"] = data.get("hotel_nombre") or ""
    summary["hotel_estrellas"] = data.get("hotel_estrellas") or 0
    summary["noches"] = data.get("noches") or ""
    summary["fecha_salida"] = data.get("fecha_salida") or ""
    summary["resumen"] = data.get("resumen") or {}
    return summary

@router.get("/paquetes")
def api_list_paquetes(current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    rows = list_rows(TABLE_PAQUETES, current_user.get("sucursal_id"), current_user.get("id"))
    return [_paquete_summary(r) for r in rows]

@router.get("/paquetes/{paquete_id}")
def api_get_paquete(paquete_id: str, current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    return _get_scoped_row(TABLE_PAQUETES, paquete_id, current_user, "paquete")

@router.post("/paquetes")
def api_create_paquete(payload: dict, current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    data = _normalize_paquete(payload)
    data.update(_ownership_fields(current_user))
    saved = save_row(TABLE_PAQUETES, data)
    if not saved:
        raise HTTPException(status_code=500, detail="No se pudo guardar el paquete. Verifique que la tabla 'paquetes_promocionales' exista en la base de datos.")
    return saved

@router.put("/paquetes/{paquete_id}")
def api_update_paquete(paquete_id: str, payload: dict, current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    existing = _get_scoped_row(TABLE_PAQUETES, paquete_id, current_user, "paquete")
    saved = save_row(TABLE_PAQUETES, _normalize_paquete(payload), existing["id"])
    if not saved:
        raise HTTPException(status_code=500, detail="No se pudo actualizar el paquete.")
    return saved

@router.delete("/paquetes/{paquete_id}")
def api_delete_paquete(paquete_id: str, current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    existing = _get_scoped_row(TABLE_PAQUETES, paquete_id, current_user, "paquete")
    if not delete_row(TABLE_PAQUETES, existing["id"]):
        raise HTTPException(status_code=500, detail="No se pudo eliminar el paquete.")
    return {"status": "success", "message": "Paquete eliminado con éxito."}

@router.post("/paquetes/{paquete_id}/duplicar")
def api_duplicate_paquete(paquete_id: str, current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    existing = _get_scoped_row(TABLE_PAQUETES, paquete_id, current_user, "paquete")
    titulo = existing.get("titulo") or ""
    if not titulo.startswith("Copia de "):
        titulo = f"Copia de {titulo}"
    data = dict(existing.get("data") or {})
    data["titulo"] = titulo
    clone = _normalize_paquete({**existing, "titulo": titulo, "data": data})
    clone.update(_ownership_fields(current_user))
    saved = save_row(TABLE_PAQUETES, clone)
    if not saved:
        raise HTTPException(status_code=500, detail="No se pudo duplicar el paquete.")
    return saved


# ──────────────────────────────────────────────────────────────────────────────
# AEROLÍNEAS (Configuración > Catálogo de Aerolíneas)
# ──────────────────────────────────────────────────────────────────────────────

def _is_logo(value) -> bool:
    """Accepts an uploaded data URL or a path to one of the bundled logos."""
    if not isinstance(value, str) or not value:
        return False
    return bool(DATA_IMAGE_RE.match(value) or LOGO_PATH_RE.match(value))

def _normalize_aerolinea(payload: dict) -> dict:
    nombre = str(payload.get("nombre") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre de la aerolínea es obligatorio.")
    logo = payload.get("logo") or ""
    return {
        "nombre": nombre,
        "codigo": str(payload.get("codigo") or "").strip()[:4].upper(),
        "logo": logo if _is_logo(logo) else "",
    }

@router.get("/aerolineas/logos-sugeridos")
def api_logos_sugeridos(current_user: dict = Depends(get_current_active_agent)):
    """Logos de aerolíneas incluidos en el proyecto (assets/logos_aerolineas)."""
    _require_agent(current_user)
    if not os.path.isdir(LOGOS_DIR):
        return []
    sugeridos = []
    for archivo in sorted(os.listdir(LOGOS_DIR)):
        if not archivo.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg")):
            continue
        base = os.path.splitext(archivo)[0]
        sugeridos.append({
            "nombre": base.replace("_", " ").replace("-", " ").title(),
            "ruta": f"/assets/logos_aerolineas/{archivo}",
        })
    return sugeridos

@router.get("/aerolineas")
def api_list_aerolineas(current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    return list_rows(TABLE_AEROLINEAS, current_user.get("sucursal_id"), current_user.get("id"))

@router.get("/aerolineas/{aerolinea_id}")
def api_get_aerolinea(aerolinea_id: str, current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    return _get_scoped_row(TABLE_AEROLINEAS, aerolinea_id, current_user, "aerolínea")

@router.post("/aerolineas")
def api_create_aerolinea(payload: dict, current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    data = _normalize_aerolinea(payload)
    data.update(_ownership_fields(current_user))
    saved = save_row(TABLE_AEROLINEAS, data)
    if not saved:
        raise HTTPException(status_code=500, detail="No se pudo guardar la aerolínea. Verifique que la tabla 'aerolineas_catalogo' exista en la base de datos.")
    return saved

@router.put("/aerolineas/{aerolinea_id}")
def api_update_aerolinea(aerolinea_id: str, payload: dict, current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    existing = _get_scoped_row(TABLE_AEROLINEAS, aerolinea_id, current_user, "aerolínea")
    saved = save_row(TABLE_AEROLINEAS, _normalize_aerolinea(payload), existing["id"])
    if not saved:
        raise HTTPException(status_code=500, detail="No se pudo actualizar la aerolínea.")
    return saved

@router.delete("/aerolineas/{aerolinea_id}")
def api_delete_aerolinea(aerolinea_id: str, current_user: dict = Depends(get_current_active_agent)):
    _require_agent(current_user)
    existing = _get_scoped_row(TABLE_AEROLINEAS, aerolinea_id, current_user, "aerolínea")
    if not delete_row(TABLE_AEROLINEAS, existing["id"]):
        raise HTTPException(status_code=500, detail="No se pudo eliminar la aerolínea.")
    return {"status": "success", "message": "Aerolínea eliminada con éxito."}
