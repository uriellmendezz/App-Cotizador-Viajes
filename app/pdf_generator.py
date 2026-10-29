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
CRUISE_TEMPLATE_NAME = "cotizacion_crucero_pdf.html"

METADATA_NAMES = ("METADATA_COTIZACION", "METADATA_PRESUPUESTO_RAPIDO")
WEEKDAYS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MONTHS_SHORT_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


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


def format_long_date(date_val) -> str:
    """
    Formats a date string (e.g. '04/08/2026', '2026-08-04', '4/8/2026')
    into Spanish long date format: '4 de agosto del 2026'.
    """
    if not date_val:
        return ""

    date_str = str(date_val).strip()
    if not date_str:
        return ""

    if "T" in date_str:
        date_str = date_str.split("T")[0].strip()

    months = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
    ]

    dt = None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y"):
        try:
            dt = datetime.strptime(date_str, fmt)
            break
        except ValueError:
            pass

    if not dt:
        parts = date_str.replace("-", "/").split("/")
        if len(parts) == 3:
            try:
                if len(parts[0]) == 4:
                    year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                else:
                    day, month, year = int(parts[0]), int(parts[1]), int(parts[2])

                if year < 100:
                    year += 2000
                if 1 <= month <= 12 and 1 <= day <= 31:
                    dt = datetime(year, month, day)
            except ValueError:
                pass

    if dt:
        month_name = months[dt.month - 1]
        return f"{dt.day} de {month_name} del {dt.year}"

    return date_str


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
    if not path.exists():
        path = ASSETS_DIR / name
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
    # ── Resolve font paths ─────────────────────────────────────────────────
    font_uris = _resolve_font_uris()

    # ── Resolve banner ─────────────────────────────────────────────────────
    banner_path = ASSETS_DIR / "Banner ONE TRIP cotizacion 2.png"
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
    svg_avion = _read_svg_content("avion.svg") or svg_avion_despegando
    svg_location = _read_svg_content("location.svg")

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

    # 3rd flight segment (Tramo adicional / intermedio)
    hoteles_raw = data.get("hoteles", [])
    fecha_vuelo_3 = data.get("fecha_vuelo_3", "")
    img_3_b64 = data.get("img_vuelo_3") or data.get("img_vuelo_3_base64")

    if not fecha_vuelo_3 or not img_3_b64:
        for h in hoteles_raw:
            if h.get("nombre") in ("METADATA_COTIZACION", "METADATA_PRESUPUESTO_RAPIDO"):
                if not fecha_vuelo_3:
                    fecha_vuelo_3 = h.get("fecha_vuelo_3", "")
                if not img_3_b64:
                    img_3_b64 = h.get("img_vuelo_3", "")
                break

    img_3_uri = None
    if img_3_b64:
        img_3_uri = _safe_base64_to_temp_file(img_3_b64, "vuelo_3_")
        if img_3_uri:
            temp_files.append(img_3_uri)

    has_vuelo_3 = bool(img_3_uri or (fecha_vuelo_3 and str(fecha_vuelo_3).strip()))

    # Detect currency
    moneda = data.get("moneda")
    if not moneda:
        for h in hoteles_raw:
            if h.get("nombre") in ("METADATA_COTIZACION", "METADATA_PRESUPUESTO_RAPIDO"):
                moneda = h.get("moneda")
                break
    if not moneda:
        moneda = "USD"

    # Detect if this is an air-only quotation (no hotels, no transfers)
    is_solo_vuelos = (
        str(data.get("tipo_cotizacion", "")).strip().lower() == "solo_vuelos"
        or any(
            isinstance(h, dict) and str(h.get("tipo_cotizacion", "")).strip().lower() == "solo_vuelos"
            for h in hoteles_raw
        )
    )

    # Detect if this is a multi-destination quotation
    is_multidestino = not is_solo_vuelos and (
        str(data.get("tipo_cotizacion", "")).strip().lower() == "multidestino"
        or any(
            isinstance(h, dict) and str(h.get("tipo_cotizacion", "")).strip().lower() == "multidestino"
            for h in hoteles_raw
        )
    )

    # Detect if this is a group / family plan quotation (prices per room base)
    is_grupal = not is_solo_vuelos and not is_multidestino and (
        str(data.get("tipo_cotizacion", "")).strip().lower() == "grupal"
        or any(
            isinstance(h, dict) and str(h.get("tipo_cotizacion", "")).strip().lower() == "grupal"
            for h in hoteles_raw
        )
    )

    # ── Process hotel data ─────────────────────────────────────────────────
    hoteles = [] if is_solo_vuelos else [h for h in hoteles_raw if h.get("nombre") not in ("METADATA_COTIZACION", "METADATA_PRESUPUESTO_RAPIDO")]
    processed_hotels = []
    primary_hotel_noches = None
    hotel_limit = 5 if is_multidestino else 3

    for idx, hotel in enumerate(hoteles[:hotel_limit]):
        h = dict(hotel)  # don't mutate original
        if is_multidestino:
            h["destino"] = h.get("destino") or h.get("ciudad") or f"Parada {idx + 1}"
        else:
            h["destino"] = ""

        # Calculate hotel nights from checkin / checkout if available
        ci_str = h.get("fecha_checkin")
        co_str = h.get("fecha_checkout")
        h_noches = None
        if ci_str and co_str:
            for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
                try:
                    dt_ci = datetime.strptime(str(ci_str).strip(), fmt)
                    dt_co = datetime.strptime(str(co_str).strip(), fmt)
                    dias = abs((dt_co - dt_ci).days)
                    if dias > 0:
                        h_noches = dias
                        break
                except ValueError:
                    pass
        if h_noches:
            h["noches"] = h_noches
            h["noches_alojamiento"] = "1 noche" if h_noches == 1 else f"{h_noches} noches"
        else:
            h["noches_alojamiento"] = h.get("noches_alojamiento") or data.get("noches_alojamiento", "7 noches")

        if idx == 0 and h.get("noches_alojamiento"):
            primary_hotel_noches = h["noches_alojamiento"]

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

        if is_grupal:
            bases = []
            for b in h.get("bases") or []:
                if not isinstance(b, dict):
                    continue
                try:
                    bases.append({
                        "pax": int(b.get("pax") or 0),
                        "label": b.get("label") or f"{b.get('pax')} personas",
                        "costo": float(b.get("costo") or 0.0),
                        "precio_persona": float(b.get("precio_persona") or 0.0),
                    })
                except (ValueError, TypeError):
                    continue
            h["bases"] = [b for b in bases if b["pax"] > 0]

        processed_hotels.append(h)

    # ── Calculate dynamic destination title font size ──────────────────────
    destino = data.get("destino", "Destino")
    destino_len = len(destino)
    if destino_len > 25:
        destino_font_size = "22pt"
    elif destino_len > 18:
        destino_font_size = "30pt"
    elif destino_len > 12:
        destino_font_size = "36pt"
    else:
        destino_font_size = "46pt"

    # ── Calculate trip duration in days for vehicle rental ─────────────────
    cantidad_dias_viaje = 7
    ida_str = data.get("fecha_vuelo_ida")
    vuelta_str = data.get("fecha_vuelo_vuelta")
    if ida_str and vuelta_str:
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
            try:
                dt_ida = datetime.strptime(str(ida_str).strip(), fmt)
                dt_vuelta = datetime.strptime(str(vuelta_str).strip(), fmt)
                dias = abs((dt_vuelta - dt_ida).days)
                if dias > 0:
                    cantidad_dias_viaje = dias
                    break
            except ValueError:
                pass
    if cantidad_dias_viaje == 7 and (primary_hotel_noches or data.get("noches_alojamiento")):
        import re
        match = re.search(r'\d+', str(primary_hotel_noches or data.get("noches_alojamiento")))
        if match:
            cantidad_dias_viaje = int(match.group())

    # ── Build template context ─────────────────────────────────────────────
    fecha_generacion = datetime.now().strftime("%d/%m/%Y")
    noches_alojamiento_final = primary_hotel_noches or data.get("noches_alojamiento", "7 noches")

    if is_multidestino:
        total_noches_itinerario = sum(h.get("noches", 0) for h in processed_hotels if h.get("noches"))
        if total_noches_itinerario > 0:
            noches_alojamiento_final = f"{total_noches_itinerario} noche" if total_noches_itinerario == 1 else f"{total_noches_itinerario} noches"
            cantidad_dias_viaje = total_noches_itinerario

    # Multidestino unified grand total calculation (fallback if not precomputed)
    costo_total_general = float(data.get("costo_total", 0.0))
    precio_persona_general = float(data.get("precio_persona", 0.0))
    if is_multidestino and (costo_total_general == 0.0 or precio_persona_general == 0.0):
        import math
        m_vuelos = float(data.get("monto_vuelos", 0.0))
        m_fee = float(data.get("fee_aereo", 0.0))
        m_traslados = float(data.get("monto_traslados", 0.0))
        m_hoteles = sum(float(h.get("costo_neto") if "costo_neto" in h else h.get("costo", 0.0)) for h in processed_hotels)
        m_admin = (m_hoteles + m_traslados) * 0.05
        cant_p = int(data.get("cantidad_pasajeros", 1))
        tot_calc = (m_vuelos + m_fee) + m_hoteles + m_traslados + m_admin
        pp_calc = tot_calc / cant_p if cant_p > 0 else tot_calc
        redond = data.get("redondear", True)
        if redond:
            pp_calc = math.ceil(pp_calc / 10.0) * 10
            tot_calc = pp_calc * cant_p
        costo_total_general = tot_calc
        precio_persona_general = pp_calc

    if is_solo_vuelos:
        # Air-only quote: the grand total card shows just flights + air fee
        if costo_total_general == 0.0 or precio_persona_general == 0.0:
            import math
            m_vuelos = float(data.get("monto_vuelos", 0.0))
            m_fee = float(data.get("fee_aereo", 0.0))
            cant_p = int(data.get("cantidad_pasajeros", 1) or 1)
            tot_calc = m_vuelos + m_fee + float(data.get("gastos_iva", 0.0))
            pp_calc = tot_calc / cant_p if cant_p > 0 else tot_calc
            if data.get("redondear", True):
                pp_calc = math.ceil(pp_calc / 10.0) * 10
                tot_calc = pp_calc * cant_p
            costo_total_general = tot_calc
            precio_persona_general = pp_calc

    context = {
        # Fonts
        **font_uris,
        # Banner
        "banner_path": banner_uri,
        # Header
        "fecha_generacion": fecha_generacion,
        "moneda": moneda,
        # Title
        "destino": destino,
        "destino_font_size": destino_font_size,
        "nombre_pax": data.get("nombre_pax", "Pasajero"),
        "fecha_salida": data.get("fecha_salida", ""),
        "format_long_date": format_long_date,
        "validez_cotizacion": data.get("validez_cotizacion", ""),
        # Services summary
        "origen": data.get("origen", "Córdoba"),
        "cantidad_pasajeros": data.get("cantidad_pasajeros", 1),
        "noches_alojamiento": noches_alojamiento_final,
        "tipo_traslado": data.get("tipo_traslado", "tradicional"),
        "cantidad_dias_viaje": cantidad_dias_viaje,
        # Multidestino / solo vuelos flags and unified pricing
        "is_multidestino": is_multidestino,
        "is_solo_vuelos": is_solo_vuelos,
        "is_grupal": is_grupal,
        "costo_total_general": costo_total_general,
        "precio_persona_general": precio_persona_general,
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
        "svg_avion": svg_avion,
        "svg_location": svg_location,
        # Flights
        "fecha_vuelo_ida": data.get("fecha_vuelo_ida", ""),
        "fecha_vuelo_vuelta": data.get("fecha_vuelo_vuelta", ""),
        "fecha_vuelo_3": fecha_vuelo_3,
        "img_vuelo_ida": img_ida_uri,
        "img_vuelo_vuelta": img_vuelta_uri,
        "img_vuelo_3": img_3_uri,
        "has_vuelo_3": has_vuelo_3,
        "detalle_vuelo_completo": data.get("detalle_vuelo_completo", ""),
        # Baggage selection list
        "equipaje": data.get("equipaje", []),
        # Hotels
        "hoteles": processed_hotels,
        "base_habitacion": data.get("base_habitacion", "Doble"),
        "format_price": format_price,
        # Transfers — used to conditionally show/hide the traslados row
        "monto_traslados": float(data.get("monto_traslados", 0.0)),
    }

    return _render_pdf(TEMPLATE_NAME, context, data, temp_files)


# ══════════════════════════════════════════════════════════════════════════════
# COTIZACIÓN DE CRUCERO — línea de tiempo vertical
# ══════════════════════════════════════════════════════════════════════════════

def _parse_any_date(date_val) -> datetime | None:
    if not date_val:
        return None
    date_str = str(date_val).strip().split("T")[0]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d.%m.%Y", "%d.%m.%y"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            pass
    return None


def _timeline_date(date_val) -> str:
    """'2027-01-30' -> 'Sábado 30 ene 2027' (rótulo de cada paso de la línea de tiempo)."""
    dt = _parse_any_date(date_val)
    if not dt:
        return ""
    return f"{WEEKDAYS_ES[dt.weekday()].capitalize()} {dt.day} {MONTHS_SHORT_ES[dt.month - 1]} {dt.year}"


def _split_port(puerto: str) -> tuple:
    """'Nassau, Bahamas' -> ('Nassau', 'Bahamas')"""
    if "," in (puerto or ""):
        ciudad, pais = puerto.split(",", 1)
        return ciudad.strip(), pais.strip()
    return (puerto or "").strip(), ""


def _nights_label(n) -> str:
    try:
        n = int(n)
    except (TypeError, ValueError):
        return ""
    if n <= 0:
        return ""
    return "1 noche" if n == 1 else f"{n} noches"


def extract_crucero(data: dict) -> dict:
    """The cruise block travels at the top level or inside the METADATA entry of `hoteles`."""
    crucero = data.get("crucero")
    if isinstance(crucero, dict) and crucero:
        return crucero
    for h in data.get("hoteles") or []:
        if isinstance(h, dict) and h.get("nombre") in METADATA_NAMES and isinstance(h.get("crucero"), dict):
            return h["crucero"]
    return {}


def _cruise_hotel(hotel: dict, idx: int, temp_files: list) -> dict:
    h = dict(hotel)
    ci = _parse_any_date(h.get("fecha_checkin"))
    co = _parse_any_date(h.get("fecha_checkout"))
    if ci and co and co > ci:
        h["noches_label"] = _nights_label((co - ci).days)
    else:
        h["noches_label"] = h.get("noches_alojamiento") or ""
    h["stars_count"] = _get_stars_count(h.get("estrellas")) if h.get("estrellas") else 0
    h["fecha_checkin_label"] = _timeline_date(h.get("fecha_checkin"))
    h["fecha_checkout_label"] = _timeline_date(h.get("fecha_checkout"))
    img = h.get("imagen1") or h.get("imagen") or ""
    h["imagen_path"] = _safe_base64_to_temp_file(img, f"crucero_hotel_{idx}_") if img else None
    if h["imagen_path"]:
        temp_files.append(h["imagen_path"])
    h.setdefault("nombre", "Alojamiento")
    return h


def generate_cruise_pdf(data: dict) -> bytes:
    """
    Generate the cruise quotation PDF: a vertical timeline that links flights,
    pre/post cruise hotels, transfers and the cruise itself with dotted lines.

    `data` follows the regular quote payload plus a `crucero` dict (barco,
    cabina, noches, fecha_embarque, itinerario, imagen_cabina, ...). Hotels in
    `hoteles` carry `etapa` = "pre" | "post".
    """
    temp_files = []
    crucero = dict(extract_crucero(data))

    moneda = data.get("moneda") or "USD"
    hoteles_raw = data.get("hoteles") or []
    for h in hoteles_raw:
        if isinstance(h, dict) and h.get("nombre") in METADATA_NAMES and h.get("moneda") and not data.get("moneda"):
            moneda = h["moneda"]

    # ── Cruise block ───────────────────────────────────────────────────────
    itinerario = []
    for idx, row in enumerate(crucero.get("itinerario") or []):
        if not isinstance(row, dict):
            continue
        dt = _parse_any_date(row.get("fecha"))
        navegacion = bool(row.get("navegacion")) or str(row.get("puerto", "")).strip().lower().startswith("naveg")
        ciudad, pais = _split_port(row.get("puerto", ""))
        itinerario.append({
            "dia": idx + 1,
            "fecha": f"{dt.day} {MONTHS_SHORT_ES[dt.month - 1]}" if dt else "",
            "dia_semana": WEEKDAYS_ES[dt.weekday()][:3] if dt else "",
            "ciudad": "Día de navegación" if navegacion else ciudad,
            "pais": "" if navegacion else pais,
            "llegada": row.get("llegada") or "",
            "salida": row.get("salida") or "",
            "navegacion": navegacion,
        })

    for key, prefix in (("imagen_cabina", "crucero_cabina_"), ("imagen_mapa", "crucero_mapa_")):
        uri = _safe_base64_to_temp_file(crucero.get(key) or "", prefix) if crucero.get(key) else None
        crucero[f"{key}_path"] = uri
        if uri:
            temp_files.append(uri)

    puertos = [r for r in itinerario if not r["navegacion"]]
    crucero["puerto_embarque"] = crucero.get("puerto_embarque") or (
        f"{puertos[0]['ciudad']}" if puertos else "")
    crucero["puerto_desembarque"] = crucero.get("puerto_desembarque") or (
        f"{puertos[-1]['ciudad']}" if puertos else "")
    crucero["embarque_ciudad"] = _split_port(crucero["puerto_embarque"])[0]
    crucero["desembarque_ciudad"] = _split_port(crucero["puerto_desembarque"])[0]
    crucero["noches_label"] = _nights_label(crucero.get("noches"))
    crucero["escalas"] = max(len(puertos) - 2, 0)
    first_row = next((r for r in (crucero.get("itinerario") or []) if isinstance(r, dict)), {})
    last_row = next((r for r in reversed(crucero.get("itinerario") or []) if isinstance(r, dict)), {})
    crucero["hora_embarque"] = first_row.get("salida") or ""
    crucero["hora_desembarque"] = last_row.get("llegada") or ""

    # ── Hotels before / after the cruise ───────────────────────────────────
    real_hotels = [h for h in hoteles_raw if isinstance(h, dict) and h.get("nombre") not in METADATA_NAMES]
    hotel_pre = [_cruise_hotel(h, i, temp_files) for i, h in enumerate(real_hotels) if h.get("etapa") == "pre"]
    hotel_post = [_cruise_hotel(h, i + 10, temp_files) for i, h in enumerate(real_hotels) if h.get("etapa") == "post"]

    # ── Flights ────────────────────────────────────────────────────────────
    incluye_vuelos = bool(data.get("incluye_vuelos", True)) and bool(
        data.get("img_vuelo_ida") or data.get("img_vuelo_vuelta") or float(data.get("monto_vuelos") or 0) > 0
    )
    img_ida_uri = img_vuelta_uri = None
    if incluye_vuelos:
        if data.get("img_vuelo_ida"):
            img_ida_uri = _safe_base64_to_temp_file(data["img_vuelo_ida"], "crucero_vuelo_ida_")
        if data.get("img_vuelo_vuelta"):
            img_vuelta_uri = _safe_base64_to_temp_file(data["img_vuelo_vuelta"], "crucero_vuelo_vuelta_")
        temp_files.extend(u for u in (img_ida_uri, img_vuelta_uri) if u)

    monto_traslados = float(data.get("monto_traslados") or 0)
    origen = data.get("origen") or ""

    # ── Timeline steps in chronological order ──────────────────────────────
    timeline = []
    if incluye_vuelos and (img_ida_uri or data.get("fecha_vuelo_ida")):
        timeline.append({
            "tipo": "vuelo", "icono": "despegue",
            "fecha": _timeline_date(data.get("fecha_vuelo_ida")),
            "titulo": "Vuelo de ida",
            "detalle": f"{origen} → {hotel_pre[0].get('ciudad') if hotel_pre and hotel_pre[0].get('ciudad') else crucero['embarque_ciudad']}".strip(" →"),
            "imagen": img_ida_uri,
        })
    for h in hotel_pre:
        timeline.append({
            "tipo": "hotel", "icono": "hotel", "fecha": h["fecha_checkin_label"],
            "titulo": "Alojamiento antes del crucero", "hotel": h,
        })
    if monto_traslados > 0:
        timeline.append({
            "tipo": "traslado", "icono": "traslado", "fecha": "",
            "titulo": "Traslado al puerto",
            "detalle": f"Traslado hacia la terminal de cruceros de {crucero['embarque_ciudad']}." if crucero["embarque_ciudad"] else "Traslado hacia la terminal de cruceros.",
        })
    timeline.append({
        "tipo": "crucero", "icono": "barco",
        "fecha": _timeline_date(crucero.get("fecha_embarque")),
        "titulo": f"Embarque en {crucero['embarque_ciudad']}" if crucero["embarque_ciudad"] else "Embarque",
    })
    timeline.append({
        "tipo": "desembarque", "icono": "ancla",
        "fecha": _timeline_date(crucero.get("fecha_desembarque")),
        "titulo": f"Desembarque en {crucero['desembarque_ciudad']}" if crucero["desembarque_ciudad"] else "Desembarque",
        "detalle": f"Llegada al puerto a las {crucero['hora_desembarque']} hs." if crucero["hora_desembarque"] else "Fin del crucero.",
    })
    if monto_traslados > 0:
        timeline.append({
            "tipo": "traslado", "icono": "traslado", "fecha": "",
            "titulo": "Traslado desde el puerto",
            "detalle": "Traslado desde la terminal de cruceros hacia el hotel." if hotel_post else "Traslado desde la terminal de cruceros hacia el aeropuerto.",
        })
    for h in hotel_post:
        timeline.append({
            "tipo": "hotel", "icono": "hotel", "fecha": h["fecha_checkin_label"],
            "titulo": "Alojamiento después del crucero", "hotel": h,
        })
    if incluye_vuelos and (img_vuelta_uri or data.get("fecha_vuelo_vuelta")):
        timeline.append({
            "tipo": "vuelo", "icono": "aterrizaje",
            "fecha": _timeline_date(data.get("fecha_vuelo_vuelta")),
            "titulo": "Vuelo de regreso",
            "detalle": f"{hotel_post[-1].get('ciudad') if hotel_post and hotel_post[-1].get('ciudad') else crucero['desembarque_ciudad']} → {origen}".strip(" →"),
            "imagen": img_vuelta_uri,
        })

    # ── Included services summary ──────────────────────────────────────────
    cant_pax = int(data.get("cantidad_pasajeros") or 1)
    pax_str = "un pasajero" if cant_pax == 1 else f"{cant_pax} pasajeros"
    servicios = []
    if incluye_vuelos:
        servicios.append(("vuelos", data.get("detalle_vuelo_completo") or f"Vuelos ida y vuelta desde {origen} para {pax_str}."))
    barco_txt = crucero.get("barco") or "el barco"
    servicios.append(("barco", f"Crucero de {crucero['noches_label'] or 'varias noches'} a bordo del {barco_txt}"
                               f"{', cabina ' + crucero['cabina'] if crucero.get('cabina') else ''}."))
    if crucero.get("paquete_bebidas"):
        servicios.append(("bebidas", f"{crucero['paquete_bebidas']}."))
    if crucero.get("incluye"):
        servicios.append(("check", crucero["incluye"].rstrip(".") + "."))
    for h in hotel_pre + hotel_post:
        etapa = "antes" if h.get("etapa") == "pre" else "después"
        ciudad = f" en {h['ciudad']}" if h.get("ciudad") else ""
        noches = f" por {h['noches_label']}" if h.get("noches_label") else ""
        servicios.append(("hotel", f"Alojamiento{ciudad}{noches} {etapa} del crucero."))
    if monto_traslados > 0:
        servicios.append(("traslados", "Traslados al puerto de embarque y desde el puerto de desembarque."))

    partes_total = (["vuelos"] if incluye_vuelos else []) + ["crucero"]
    if hotel_pre or hotel_post:
        partes_total.append("alojamientos")
    if monto_traslados > 0:
        partes_total.append("traslados")
    partes_total.append("impuestos")
    total_incluye = "Incluye " + ", ".join(partes_total[:-1]) + " e " + partes_total[-1] + "."

    destino = data.get("destino") or crucero.get("barco") or "Crucero"
    destino_len = len(destino)
    destino_font_size = "22pt" if destino_len > 25 else "30pt" if destino_len > 18 else "36pt" if destino_len > 12 else "44pt"

    banner_path = ASSETS_DIR / "Banner ONE TRIP cotizacion 2.png"
    context = {
        **_resolve_font_uris(),
        "banner_path": _path_to_file_uri(banner_path) if banner_path.exists() else "",
        "fecha_generacion": datetime.now().strftime("%d/%m/%Y"),
        "moneda": moneda,
        "destino": destino,
        "destino_font_size": destino_font_size,
        "nombre_pax": data.get("nombre_pax", "Pasajero"),
        "fecha_salida_label": format_long_date(data.get("fecha_salida") or crucero.get("fecha_embarque")),
        "validez_cotizacion": data.get("validez_cotizacion", ""),
        "cantidad_pasajeros": cant_pax,
        "base_habitacion": data.get("base_habitacion", ""),
        "crucero": crucero,
        "itinerario": itinerario,
        "timeline": timeline,
        "servicios": servicios,
        "total_incluye": total_incluye,
        "costo_total_general": float(data.get("costo_total") or 0),
        "precio_persona_general": float(data.get("precio_persona") or 0),
        "format_price": format_price,
        "svg_avion_despegando": _read_svg_content("avion-despegando.svg"),
        "svg_avion_aterrizando": _read_svg_content("avion-aterrizando.svg"),
        "svg_cama": _read_svg_content("cama.svg"),
        "svg_traslados": _read_svg_content("traslados.svg"),
        "svg_luna": _read_svg_content("luna.svg"),
        "svg_cafe": _read_svg_content("cafe.svg"),
        "svg_vuelos": _read_svg_content("ticket-vuelos.svg"),
        "svg_persona": _read_svg_content("persona.svg"),
    }
    return _render_pdf(CRUISE_TEMPLATE_NAME, context, data, temp_files)


def _resolve_font_uris() -> dict:
    """file:// URIs of the Montserrat weights used by the PDF templates."""
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
    return font_uris


def _render_pdf(template_name: str, context: dict, data: dict, temp_files: list) -> bytes:
    """Render a Jinja template with WeasyPrint, embed the quote as /CotizacionData and clean temp images."""
    try:
        from weasyprint import HTML
    except ImportError as e:
        raise RuntimeError(
            "WeasyPrint no está instalado. Ejecutá: pip install weasyprint "
            "(requiere GTK3 en Windows). "
            "Más info: https://weasyprint.readthedocs.io/en/stable/first_steps.html"
        ) from e

    # ── Render HTML with Jinja2 ────────────────────────────────────────────
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=False,
    )
    template = env.get_template(template_name)
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
    finally:
        _cleanup_temp_files(temp_files)

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

    return pdf_bytes


def _cleanup_temp_files(temp_files: list) -> None:
    """Delete the temporary image files referenced by file:// URIs."""
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
