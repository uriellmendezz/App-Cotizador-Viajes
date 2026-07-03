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


def format_price(val: float) -> str:
    """Formats float price to string with dot as thousands separator and comma as decimal separator (e.g. 1.234,56)."""
    if val is None:
        return "0,00"
    try:
        val = float(val)
    except (ValueError, TypeError):
        return "0,00"
    
    s = f"{val:.2f}"
    parts = s.split('.')
    integer_part = parts[0]
    decimal_part = parts[1]
    
    # Add dots as thousands separators
    reversed_integer = integer_part[::-1]
    chunks = [reversed_integer[i:i+3] for i in range(0, len(reversed_integer), 3)]
    formatted_integer = ".".join(chunks)[::-1]
    
    return f"{formatted_integer},{decimal_part}"


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


def _read_svg_content(name: str) -> str:
    """Reads local SVG file, strips style and fill attributes, and returns the raw SVG tag content."""
    import re
    path = ICONS_DIR / name
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            # Find index of <svg to ignore XML header
            idx = content.find("<svg")
            if idx != -1:
                content = content[idx:]
            # Clean up hardcoded style/fill tags to allow dynamic coloring in CSS
            # Preserving fill:none and fill="none" to prevent transparent background helpers from rendering as black boxes
            content = re.sub(r'fill:(?!none\b)[^;"]*;?', '', content)
            content = re.sub(r'\bfill="(?!none\b)[^"]*"', '', content)
            content = re.sub(r'serif:id="[^"]*"', '', content)
            return content
        except Exception as e:
            print(f"[PDF] Error reading SVG {name}: {e}")
    return ""


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
    banner_path = ASSETS_DIR / "Banner ONE TRIP cotizacion.png"
    banner_uri = _path_to_file_uri(banner_path) if banner_path.exists() else ""

    # ── Resolve SVG inlines ────────────────────────────────────────────────
    svg_vuelos = _read_svg_content("ticket-vuelos.svg")
    svg_dormitorios = _read_svg_content("cama.svg")
    svg_traslados = _read_svg_content("traslados.svg")
    svg_noches = _read_svg_content("luna.svg")
    svg_regimen = _read_svg_content("cafe.svg")
    svg_estrella = _read_svg_content("estrella.svg")
    svg_bag_mano = _read_svg_content("equipaje-de-mano.svg")
    svg_bag_carry = _read_svg_content("carry-on.svg")
    svg_bag_valija = _read_svg_content("valija-23kg.svg")
    svg_avion_despegando = _read_svg_content("avion-despegando.svg")
    svg_avion_aterrizando = _read_svg_content("avion-aterrizando.svg")

    # ── Decode flight images from base64 ───────────────────────────────────
    temp_files = []  # track temp files for cleanup

    img_ida_uri = None
    img_ida_b64 = data.get("img_vuelo_ida") or data.get("img_vuelo_ida_base64")
    if img_ida_b64:
        img_ida_uri = _safe_base64_to_temp_file(img_ida_b64, "vuelo_ida_")
        if img_ida_uri:
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
        "validez_cotizacion": data.get("validez_cotizacion", ""),
        # Services summary
        "origen": data.get("origen", "Córdoba"),
        "cantidad_pasajeros": data.get("cantidad_pasajeros", 1),
        "noches_alojamiento": data.get("noches_alojamiento", "7 noches"),
        # SVGs for dynamic inlining and styling
        "svg_vuelos": svg_vuelos,
        "svg_dormitorios": svg_dormitorios,
        "svg_traslados": svg_traslados,
        "svg_noches": svg_noches,
        "svg_regimen": svg_regimen,
        "svg_estrella": svg_estrella,
        "svg_bag_mano": svg_bag_mano,
        "svg_bag_carry": svg_bag_carry,
        "svg_bag_valija": svg_bag_valija,
        "svg_avion_despegando": svg_avion_despegando,
        "svg_avion_aterrizando": svg_avion_aterrizando,
        # Flights
        "fecha_vuelo_ida": data.get("fecha_vuelo_ida", ""),
        "fecha_vuelo_vuelta": data.get("fecha_vuelo_vuelta", ""),
        "img_vuelo_ida": img_ida_uri,
        "img_vuelo_vuelta": img_vuelta_uri,
        "detalle_vuelo_completo": data.get("detalle_vuelo_completo", ""),
        # Baggage selection list
        "equipaje": data.get("equipaje", []),
        # Hotels
        "hoteles": processed_hotels,
        "base_habitacion": data.get("base_habitacion", "Doble"),
        "format_price": format_price,
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

    # ── Inject PDF Metadata with pypdf ─────────────────────────────────────
    try:
        from pypdf import PdfReader, PdfWriter
        import io
        import json

        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)

        # Serialize complete original data
        metadata = reader.metadata
        metadata_to_add = {
            **metadata,
            "/CotizacionData": json.dumps(data, ensure_ascii=False)
        }
        writer.add_metadata(metadata_to_add)

        output_stream = io.BytesIO()
        writer.write(output_stream)
        pdf_bytes = output_stream.getvalue()
        print("[PDF] Metadata successfully injected into /CotizacionData.")
    except Exception as meta_err:
        print(f"[PDF] Warning: Failed to inject metadata. Details: {meta_err}")

    # ── Cleanup temporary image files ──────────────────────────────────────
    for uri in temp_files:
        try:
            if uri and uri.startswith("file:///"):
                file_path = uri.replace("file:///", "")
                if os.name == 'nt' and file_path.startswith('/'):
                    # Strip leading slash on Windows
                    file_path = file_path[1:]
                # Resolve Windows backslash issues
                file_path = file_path.replace("/", os.sep)
                if os.path.exists(file_path):
                    os.remove(file_path)
        except Exception as cleanup_err:
            print(f"[PDF] Warning: Could not clean up temp file: {cleanup_err}")

    return pdf_bytes
