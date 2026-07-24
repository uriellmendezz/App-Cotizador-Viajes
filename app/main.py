import os
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Import routers
from app.routers import auth, cotizaciones, presupuestos, admin

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

# Base path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Include routers
app.include_router(auth.router)
app.include_router(cotizaciones.router)
app.include_router(presupuestos.router)
app.include_router(admin.router)

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
