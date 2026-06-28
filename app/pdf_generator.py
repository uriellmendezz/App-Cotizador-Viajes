"""
pdf_generator.py — Módulo de generación de cotizaciones en PDF (A4 vertical)

Utiliza WeasyPrint para renderizar una plantilla HTML/CSS Jinja2 con datos
dinámicos y devolver los bytes del PDF generado.
"""
import os
import sys

# ── GTK3 DLL Search Paths for Windows ─────────────────────────────────────────
if os.name == 'nt':
    gtk_paths = [
        r"C:\Program Files\GTK3-Runtime Win64\bin",
        r"C:\Program Files\GTK3-Runtime\bin",
        r"C:\msys64\mingw64\bin",
        r"C:\msys64\ucrt64\bin",
    ]
    # Check if there is an env var first
    if "WEASYPRINT_DLL_DIRECTORIES" in os.environ:
        gtk_paths.insert(0, os.environ["WEASYPRINT_DLL_DIRECTORIES"])
        
    for path in gtk_paths:
        if os.path.exists(path):
            os.environ["WEASYPRINT_DLL_DIRECTORIES"] = path
            os.environ["PATH"] = path + os.pathsep + os.environ.get("PATH", "")
            if hasattr(os, "add_dll_directory"):
                try:
                    os.add_dll_directory(path)
                    print(f"[PDF] Cargo DLLs de GTK3 desde: {path}")
                except Exception as e:
                    print(f"[PDF] Error al cargar DLLs desde {path}: {e}")
            break

import base64
import tempfile
from datetime import datetime
from pathlib import Path


from jinja2 import Environment, FileSystemLoader

# ── Path resolution ────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"
ASSETS_DIR = BASE_DIR / "assets"
ICONS_DIR = ASSETS_DIR / "iconos"
FONTS_DIR = BASE_DIR / "Montserrat" / "static"

TEMPLATE_NAME = "cotizacion_pdf_v2.html"


def _path_to_file_uri(path: Path) -> str:
    """Convert a local filesystem path to a file:// URI for WeasyPrint."""
    abs_path = path.resolve()
    # On Windows, use forward slashes and add a leading slash
    return abs_path.as_uri()


def _safe_base64_to_temp_file(b64_str: str, prefix: str = "img_") -> str | None:
    """
    Decode a base64-encoded image string and write it to a temporary file.
    Returns the file:// URI of the temporary file, or None on failure.
    """
    if not b64_str:
        return None

    try:
        # Strip data URI prefix if present (e.g. "data:image/png;base64,...")
        if "," in b64_str:
            b64_str = b64_str.split(",", 1)[1]

        image_bytes = base64.b64decode(b64_str)

        tmp = tempfile.NamedTemporaryFile(
            delete=False, suffix=".png", prefix=prefix
        )
        tmp.write(image_bytes)
        tmp.close()

        return _path_to_file_uri(Path(tmp.name))
    except Exception as e:
        print(f"[PDF] Error decoding base64 image ({prefix}): {e}")
        return None


def _get_stars_count(val) -> int:
    """Extract numeric star rating (1–5) from various input formats."""
    if val is None:
        return 4
    if isinstance(val, int):
        return min(max(val, 1), 5)
    s = str(val).strip()
    if "★" in s:
        return min(max(s.count("★"), 1), 5)
    try:
        return min(max(int(float(s)), 1), 5)
    except (ValueError, TypeError):
        return 4


def _resolve_icon(name: str) -> str | None:
    """Return the file:// URI for an icon if it exists, else None."""
    path = ICONS_DIR / name
    if path.exists():
        return _path_to_file_uri(path)
    return None


def generate_pdf(data: dict) -> bytes:
    """
    Generate a travel quotation PDF from the provided data dictionary.

    Parameters
    ----------
    data : dict
        Must include keys such as: nombre_pax, destino, cantidad_pasajeros,
        fecha_salida, origen, fecha_vuelo_ida, fecha_vuelo_vuelta,
        img_vuelo_ida (base64), img_vuelo_vuelta (base64),
        hoteles (list of dicts), noches_alojamiento, base_habitacion, etc.

    Returns
    -------
    bytes
        The raw PDF content.

    Raises
    ------
    RuntimeError
        If WeasyPrint fails to render the PDF.
    """
    # Late import so the rest of the app doesn't break if WeasyPrint isn't installed
    try:
        from weasyprint import HTML
    except ImportError as e:
        raise RuntimeError(
            "WeasyPrint no está instalado. Ejecutá: pip install weasyprint "
            "(requiere GTK3 en Windows). "
            "Más info: https://weasyprint.readthedocs.io/en/stable/first_steps.html"
        ) from e

    # ── Resolve font paths ─────────────────────────────────────────────────
    font_map = {
        "font_regular": FONTS_DIR / "Montserrat-Regular.ttf",
        "font_medium": FONTS_DIR / "Montserrat-Medium.ttf",
        "font_semibold": FONTS_DIR / "Montserrat-SemiBold.ttf",
        "font_bold": FONTS_DIR / "Montserrat-Bold.ttf",
        "font_extrabold": FONTS_DIR / "Montserrat-ExtraBold.ttf",
        "font_black": FONTS_DIR / "Montserrat-Black.ttf",
    }
    font_uris = {}
    for key, path in font_map.items():
        if path.exists():
            font_uris[key] = _path_to_file_uri(path)
        else:
            print(f"[PDF] Warning: Font not found: {path}")
            font_uris[key] = ""

    # ── Resolve banner ─────────────────────────────────────────────────────
    banner_path = ASSETS_DIR / "Letras Rosas fondo transparente.png"
    banner_uri = _path_to_file_uri(banner_path) if banner_path.exists() else ""

    # ── Resolve icons ──────────────────────────────────────────────────────
    icon_vuelos = _resolve_icon("vuelos.svg")
    icon_dormitorios = _resolve_icon("dormitorios.svg")
    icon_traslados = _resolve_icon("traslados.svg")
    icon_noches = _resolve_icon("noches.svg")
    icon_regimen = _resolve_icon("regimen.svg")

    # ── Decode flight images from base64 ───────────────────────────────────
    temp_files = []  # track temp files for cleanup

    img_ida_uri = None
    img_ida_b64 = data.get("img_vuelo_ida") or data.get("img_vuelo_ida_base64")
    if img_ida_b64:
        img_ida_uri = _safe_base64_to_temp_file(img_ida_b64, "vuelo_ida_")
        if img_ida_uri:
            # Extract the temp file path for later cleanup
            temp_files.append(img_ida_uri)

    img_vuelta_uri = None
    img_vuelta_b64 = data.get("img_vuelo_vuelta") or data.get("img_vuelo_vuelta_base64")
    if img_vuelta_b64:
        img_vuelta_uri = _safe_base64_to_temp_file(img_vuelta_b64, "vuelo_vuelta_")
        if img_vuelta_uri:
            temp_files.append(img_vuelta_uri)

    # ── Process hotel data ─────────────────────────────────────────────────
    hoteles = data.get("hoteles", [])
    processed_hotels = []

    for idx, hotel in enumerate(hoteles[:3]):  # Max 3 hotels
        h = dict(hotel)  # don't mutate original

        # Star rating
        h["stars_count"] = _get_stars_count(h.get("estrellas"))

        # Hotel image (base64 -> temp file)
        hotel_img = (
            h.get("imagen1") or h.get("imagen") or h.get("imagen1_base64") or ""
        )
        if hotel_img:
            img_uri = _safe_base64_to_temp_file(hotel_img, f"hotel_{idx}_")
            h["imagen_path"] = img_uri
            if img_uri:
                temp_files.append(img_uri)
        else:
            h["imagen_path"] = None

        # Default values for missing fields
        h.setdefault("nombre", f"Hotel {idx + 1}")
        h.setdefault("descripcion", "")
        h.setdefault("regimen", "Consultar")
        h.setdefault("habitacion", "Estándar")
        h.setdefault("costo", 0.0)
        h.setdefault("precio_persona", 0.0)

        # Ensure numeric types
        try:
            h["costo"] = float(h["costo"])
        except (ValueError, TypeError):
            h["costo"] = 0.0
        try:
            h["precio_persona"] = float(h["precio_persona"])
        except (ValueError, TypeError):
            h["precio_persona"] = 0.0

        processed_hotels.append(h)

    # ── Build template context ─────────────────────────────────────────────
    fecha_generacion = datetime.now().strftime("%d/%m/%Y")

    context = {
        # Fonts
        **font_uris,
        # Banner
        "banner_path": banner_uri,
        # Header
        "fecha_generacion": fecha_generacion,
        # Title
        "destino": data.get("destino", "Destino"),
        "nombre_pax": data.get("nombre_pax", "Pasajero"),
        "fecha_salida": data.get("fecha_salida", ""),
        # Services summary
        "origen": data.get("origen", "Córdoba"),
        "cantidad_pasajeros": data.get("cantidad_pasajeros", 1),
        "noches_alojamiento": data.get("noches_alojamiento", "7 noches"),
        # Icons
        "icon_vuelos": icon_vuelos,
        "icon_dormitorios": icon_dormitorios,
        "icon_traslados": icon_traslados,
        "icon_noches": icon_noches,
        "icon_regimen": icon_regimen,
        # Flights
        "fecha_vuelo_ida": data.get("fecha_vuelo_ida", ""),
        "fecha_vuelo_vuelta": data.get("fecha_vuelo_vuelta", ""),
        "img_vuelo_ida": img_ida_uri,
        "img_vuelo_vuelta": img_vuelta_uri,
        # Hotels
        "hoteles": processed_hotels,
        "base_habitacion": data.get("base_habitacion", "Doble"),
    }

    # ── Render HTML with Jinja2 ────────────────────────────────────────────
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=False,
    )
    template = env.get_template(TEMPLATE_NAME)
    html_content = template.render(**context)

    # ── Generate PDF with WeasyPrint ───────────────────────────────────────
    try:
        html_doc = HTML(
            string=html_content,
            base_url=str(BASE_DIR),
        )
        pdf_bytes = html_doc.write_pdf()
    except Exception as e:
        raise RuntimeError(f"Error generando el PDF con WeasyPrint: {e}") from e

    # ── Cleanup temporary image files ──────────────────────────────────────
    for uri in temp_files:
        try:
            # Convert file:// URI back to a path for deletion
            if uri and uri.startswith("file:///"):
                # On Windows: file:///C:/... -> C:/...
                file_path = uri.replace("file:///", "")
                if os.path.exists(file_path):
                    os.remove(file_path)
        except Exception as cleanup_err:
            print(f"[PDF] Warning: Could not clean up temp file: {cleanup_err}")

    return pdf_bytes
