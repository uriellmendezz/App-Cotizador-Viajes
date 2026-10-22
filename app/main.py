import os
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Import routers
from app.routers import auth, cotizaciones, presupuestos, admin, user_franchise, catalogo, cruceros

load_dotenv()

app = FastAPI(title="Sistema de Cotizaciones - One Trip Giordano")

# CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Comprime las respuestas (los JS de la interfaz pesan cientos de KB)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def cache_headers(request: Request, call_next):
    """El código de la interfaz (HTML/JS/CSS) se revalida en cada carga para que
    nunca quede una versión vieja en caché (responde 304 si no cambió); las
    imágenes y fuentes se guardan un día."""
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/"):
        return response
    if path.startswith("/assets/") or path.startswith("/Montserrat/"):
        response.headers.setdefault("Cache-Control", "public, max-age=86400")
    else:
        response.headers["Cache-Control"] = "no-cache"
    return response

# Base path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Include routers
app.include_router(auth.router)
app.include_router(cotizaciones.router)
app.include_router(presupuestos.router)
app.include_router(admin.router)
app.include_router(user_franchise.router)
app.include_router(catalogo.router)
app.include_router(cruceros.router)

# Mount static and assets files
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
app.mount("/assets", StaticFiles(directory=os.path.join(BASE_DIR, "assets")), name="assets")

# Root endpoints
@app.get("/")
def read_root():
    return FileResponse(os.path.join(BASE_DIR, "static", "index.html"))

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return FileResponse(os.path.join(BASE_DIR, "assets", "favicon.png"))

# SPA Catch-all endpoint
@app.get("/{catchall:path}")
def catch_all(catchall: str):
    # Do not catch API routes that are 404
    if catchall.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
    return FileResponse(os.path.join(BASE_DIR, "static", "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
