from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.crucero_parser import parse_cruise_pdf
from app.routers.auth import get_current_active_agent

router = APIRouter(prefix="/api/crucero", tags=["cruceros"])

MAX_PDF_BYTES = 15 * 1024 * 1024


@router.post("/extraer-pdf")
async def api_extraer_pdf_crucero(file: UploadFile = File(...), current_user: dict = Depends(get_current_active_agent)):
    """Lee el presupuesto del operador (PDF) y devuelve los datos del crucero para el formulario."""
    contents = await file.read()
    if not contents.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="El archivo no es un PDF válido.")
    if len(contents) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="El PDF supera el máximo de 15 MB.")

    load_dotenv(override=True)
    try:
        data = parse_cruise_pdf(contents)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"No se pudo leer el PDF del crucero: {e}")

    if not data.get("campos_detectados"):
        raise HTTPException(
            status_code=422,
            detail="No se encontraron datos de crucero en el PDF. Completá los campos manualmente.",
        )
    return data
