"""
crucero_parser.py — Extracción de datos de presupuestos de cruceros en PDF

Los agentes descargan el presupuesto desde la página del operador mayorista
(ej. Ola / Krooze) y lo arrastran a la aplicación. Este módulo lee el texto y
las imágenes del PDF y devuelve los campos que usa la Cotización de Crucero:
barco, cabina, noches, fecha de embarque, itinerario día por día, precio,
foto de la cabina y mapa de la ruta.

El parser principal trabaja con expresiones regulares sobre el formato de
Krooze (etiqueta en una línea, valor en la siguiente). Si faltan los campos
esenciales y hay una GROQ_API_KEY configurada, se completa lo que falte con
un modelo de lenguaje para soportar presupuestos de otros operadores.
"""
import base64
import hashlib
import io
import json
import os
import re
from datetime import datetime, timedelta

import requests

# Líneas de la naviera reconocibles a partir del nombre del barco
NAVIERAS = {
    "msc": "MSC Cruceros",
    "costa": "Costa Cruceros",
    "norwegian": "Norwegian Cruise Line",
    "ncl": "Norwegian Cruise Line",
    "carnival": "Carnival Cruise Line",
    "celebrity": "Celebrity Cruises",
    "disney": "Disney Cruise Line",
    "princess": "Princess Cruises",
    "virgin": "Virgin Voyages",
    "oceania": "Oceania Cruises",
    "silversea": "Silversea",
    "regent": "Regent Seven Seas",
    "explora": "Explora Journeys",
    "holland": "Holland America Line",
    "cunard": "Cunard",
}

# Los barcos de Royal Caribbean no llevan el nombre de la naviera
ROYAL_CARIBBEAN_SUFFIX = "of the seas"

DRINK_PACKAGES = [
    "Premium Extra", "Easy Plus", "Easy", "Deluxe Beverage", "Brindiamo",
    "Più Gusto", "Pranzo & Cena", "Classic", "Premium", "Unlimited",
]

LABELS = {
    "codigo_presupuesto": ("Presupuesto", "Reserva", "Cotización"),
    "noches": ("Noches",),
    "fecha_embarque": ("Embarque", "Salida", "Fecha de salida"),
    "barco": ("Barco", "Buque", "Navío", "Ship"),
    "cabina": ("Cabina", "Categoría", "Camarote"),
    "pasajeros": ("Pasajeros", "Huéspedes"),
}

MONTHS_ES = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "sep": 9, "set": 9, "oct": 10, "nov": 11, "dic": 12,
}

# Fila del itinerario: "30.01.27 Miami, Estados Unidos - 16:00"
ITINERARY_ROW = re.compile(
    r"^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s+(.+?)\s+(\d{1,2}:\d{2}|-)\s+(\d{1,2}:\d{2}|-)\s*$"
)
ITINERARY_DATE_ONLY = re.compile(r"^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s+(.+)$")
TIMES_ONLY = re.compile(r"^(\d{1,2}:\d{2}|-)\s+(\d{1,2}:\d{2}|-)\s*$")

PRICE = re.compile(r"(US\$|USD|U\$S|R\$|€|EUR|\$)\s*([\d.,]+)")

# Encabezados y pies que el navegador agrega al imprimir la página del operador
NOISE = re.compile(r"^(https?://|\d{1,2}/\d{1,2}/\d{2},\s*\d{1,2}:\d{2})")


def _clean_lines(text: str) -> list:
    lines = []
    for raw in text.splitlines():
        line = raw.replace("\xa0", " ").strip()
        # Íconos de fuentes web (área de uso privado de Unicode)
        line = re.sub(r"[-]", "", line).strip()
        if line and not NOISE.match(line):
            lines.append(line)
    return lines


def _parse_date(value: str) -> datetime | None:
    value = (value or "").strip()
    for fmt in ("%d/%m/%Y", "%d.%m.%Y", "%d-%m-%Y", "%d/%m/%y", "%d.%m.%y", "%d-%m-%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            pass
    # "30 ene 2027"
    m = re.match(r"(\d{1,2})\s+(?:de\s+)?([a-záé]{3})[a-záé]*\.?\s+(?:de\s+)?(\d{4})", value.lower())
    if m and m.group(2)[:3] in MONTHS_ES:
        try:
            return datetime(int(m.group(3)), MONTHS_ES[m.group(2)[:3]], int(m.group(1)))
        except ValueError:
            return None
    return None


def _iso(dt: datetime | None) -> str:
    return dt.strftime("%Y-%m-%d") if dt else ""


def parse_amount(raw: str) -> float:
    """'1.500' -> 1500.0, '1.500,50' -> 1500.5, '1,500.50' -> 1500.5"""
    s = (raw or "").strip()
    if not s:
        return 0.0
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        head, tail = s.rsplit(",", 1)
        s = s.replace(",", "") if len(tail) == 3 else head.replace(",", "") + "." + tail
    elif "." in s:
        head, tail = s.rsplit(".", 1)
        if len(tail) == 3:
            s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _value_after_label(lines: list, labels: tuple) -> str:
    """Formato Krooze: la etiqueta ocupa una línea y el valor la siguiente."""
    wanted = {l.lower() for l in labels}
    for i, line in enumerate(lines[:-1]):
        if line.lower().rstrip(":") in wanted:
            return lines[i + 1].strip()
        # Formato "Etiqueta: valor" en la misma línea
        for label in labels:
            m = re.match(rf"^{re.escape(label)}\s*:\s*(.+)$", line, re.IGNORECASE)
            if m:
                return m.group(1).strip()
    return ""


def infer_naviera(barco: str) -> str:
    name = (barco or "").strip().lower()
    if not name:
        return ""
    if name.endswith(ROYAL_CARIBBEAN_SUFFIX):
        return "Royal Caribbean"
    first = name.split()[0]
    return NAVIERAS.get(first, "")


def _parse_itinerary(lines: list) -> list:
    """Filas día / puerto / llegada / salida. Los puertos pueden ocupar dos líneas."""
    rows = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = ITINERARY_ROW.match(line)
        if m:
            fecha, puerto, llegada, salida = m.groups()
            rows.append((fecha, puerto, llegada, salida))
            i += 1
            continue
        m = ITINERARY_DATE_ONLY.match(line)
        if m and i + 1 < len(lines):
            # El nombre del puerto se partió: "Santo Tomás, Islas" / "Vírgenes Americanas" / "08:00 18:00"
            fecha, puerto = m.groups()
            j = i + 1
            extra = []
            while j < len(lines) and j <= i + 3:
                t = TIMES_ONLY.match(lines[j])
                if t:
                    rows.append((fecha, " ".join([puerto] + extra), t.group(1), t.group(2)))
                    i = j + 1
                    break
                tail = ITINERARY_ROW.match(f"00.00.00 {lines[j]}")
                if tail:
                    rows.append((fecha, " ".join([puerto] + extra + [tail.group(2)]), tail.group(3), tail.group(4)))
                    i = j + 1
                    break
                extra.append(lines[j])
                j += 1
            else:
                i += 1
            continue
        i += 1

    itinerario = []
    for fecha, puerto, llegada, salida in rows:
        dt = _parse_date(fecha)
        if not dt:
            continue
        puerto = re.sub(r"\s+", " ", puerto).strip()
        navegacion = bool(re.search(r"navegaci[oó]n|at sea|alta mar", puerto, re.IGNORECASE))
        itinerario.append({
            "fecha": _iso(dt),
            "puerto": "Navegación" if navegacion else puerto,
            "llegada": "" if llegada == "-" else llegada,
            "salida": "" if salida == "-" else salida,
            "navegacion": navegacion,
        })
    return itinerario


def _parse_price(lines: list) -> tuple:
    """Primer importe con moneda. Krooze muestra el total de la cabina."""
    for line in lines:
        m = PRICE.search(line)
        if m:
            symbol, amount = m.groups()
            moneda = "EUR" if symbol in ("€", "EUR") else ("BRL" if symbol == "R$" else "USD")
            return parse_amount(amount), moneda
    return 0.0, ""


def _parse_drinks(text: str) -> str:
    lowered = text.lower()
    if "bebida" not in lowered and "drink" not in lowered and "beverage" not in lowered:
        return ""
    for name in DRINK_PACKAGES:
        if re.search(rf"\b{re.escape(name.lower())}\b", lowered):
            return f"Paquete de bebidas {name}"
    return "Paquete de bebidas incluido"


def _extract_images(reader) -> list:
    """
    Imágenes del PDF como JPEG en base64, sin logos: se descartan las chicas
    y las que se repiten en varias páginas (encabezados del operador).
    """
    try:
        from PIL import Image  # noqa: F401  (pypdf la necesita para decodificar)
    except ImportError:
        return []

    seen = {}
    found = []
    for page_idx, page in enumerate(reader.pages):
        try:
            page_images = list(page.images)
        except Exception as e:
            print(f"[Crucero] No se pudieron leer las imágenes de la página {page_idx + 1}: {e}")
            continue
        page_text = (page.extract_text() or "").lower()
        for img in page_images:
            digest = hashlib.md5(img.data).hexdigest()
            seen[digest] = seen.get(digest, 0) + 1
            try:
                pil = img.image
            except Exception:
                continue
            found.append((digest, page_idx, page_text, pil))

    images = []
    for digest, page_idx, page_text, pil in found:
        width, height = pil.size
        if seen[digest] > 1 or width < 200 or height < 150:
            continue
        if any(i["hash"] == digest for i in images):
            continue
        rgb = pil.convert("RGB")
        rgb.thumbnail((1200, 1200))
        buf = io.BytesIO()
        rgb.save(buf, format="JPEG", quality=82)
        images.append({
            "hash": digest,
            "page": page_idx,
            "width": width,
            "height": height,
            "has_itinerary": "itinerario" in page_text or "itinerary" in page_text,
            "data": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii"),
        })
    return images


def _classify_images(images: list) -> tuple:
    """El mapa acompaña al itinerario; la foto de la cabina va junto al precio."""
    mapa = next((i for i in images if i["has_itinerary"]), None)
    cabina_candidates = [i for i in images if i is not mapa]
    cabina = max(cabina_candidates, key=lambda i: i["width"] * i["height"], default=None)
    return (mapa["data"] if mapa else ""), (cabina["data"] if cabina else "")


def _complete_with_llm(text: str, data: dict) -> dict:
    """Pide a Groq los campos que el parser no encontró. Nunca pisa valores ya detectados."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return data

    prompt = (
        "Extraé los datos de este presupuesto de crucero y respondé SOLO con un objeto JSON con estas claves: "
        "naviera, barco, cabina, cabina_tamano, noches (entero), fecha_embarque (YYYY-MM-DD), "
        "fecha_desembarque (YYYY-MM-DD), pasajeros (entero), precio (número, total de la cabina), "
        "moneda (USD/EUR/BRL), paquete_bebidas, incluye (texto breve), "
        "itinerario (lista de objetos con fecha YYYY-MM-DD, puerto, llegada HH:MM, salida HH:MM). "
        "Usá cadena vacía o 0 cuando un dato no figure.\n\n" + text[:12000]
    )
    for model in ("llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant"):
        try:
            res = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0,
                    "response_format": {"type": "json_object"},
                },
                timeout=25,
            )
            if res.status_code != 200:
                print(f"[Crucero] Groq {model} respondió {res.status_code}")
                continue
            content = res.json()["choices"][0]["message"]["content"]
            llm = json.loads(content)
        except Exception as e:
            print(f"[Crucero] Error consultando Groq ({model}): {e}")
            continue

        for key in ("naviera", "barco", "cabina", "cabina_tamano", "paquete_bebidas", "incluye", "moneda",
                    "fecha_embarque", "fecha_desembarque"):
            if not data.get(key) and llm.get(key):
                data[key] = str(llm[key]).strip()
        for key in ("noches", "pasajeros"):
            if not data.get(key):
                try:
                    data[key] = int(llm.get(key) or 0)
                except (TypeError, ValueError):
                    pass
        if not data.get("precio"):
            try:
                data["precio"] = float(llm.get("precio") or 0)
            except (TypeError, ValueError):
                pass
        if not data.get("itinerario") and isinstance(llm.get("itinerario"), list):
            data["itinerario"] = [
                {
                    "fecha": str(r.get("fecha", "")),
                    "puerto": str(r.get("puerto", "")),
                    "llegada": str(r.get("llegada", "") or ""),
                    "salida": str(r.get("salida", "") or ""),
                    "navegacion": bool(re.search(r"navegaci[oó]n|at sea", str(r.get("puerto", "")), re.IGNORECASE)),
                }
                for r in llm["itinerario"] if isinstance(r, dict)
            ]
        data["completado_con_ia"] = True
        break
    return data


def parse_cruise_pdf(pdf_bytes: bytes) -> dict:
    """Devuelve los datos del crucero detectados en el PDF del operador."""
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(pdf_bytes))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    lines = _clean_lines(text)

    barco = _value_after_label(lines, LABELS["barco"])
    cabina = _value_after_label(lines, LABELS["cabina"])
    embarque = _parse_date(_value_after_label(lines, LABELS["fecha_embarque"]))

    noches_raw = _value_after_label(lines, LABELS["noches"])
    noches = int(re.search(r"\d+", noches_raw).group()) if re.search(r"\d+", noches_raw) else 0
    pax_raw = _value_after_label(lines, LABELS["pasajeros"])
    pasajeros = int(re.search(r"\d+", pax_raw).group()) if re.search(r"\d+", pax_raw) else 0

    tamano = ""
    m = re.search(r"Tama[ñn]o\s*:?\s*([\d.,]+\s*m[²2])", text, re.IGNORECASE)
    if m:
        tamano = m.group(1).replace("m2", "m²").strip()

    itinerario = _parse_itinerary(lines)
    if not embarque and itinerario:
        embarque = _parse_date(itinerario[0]["fecha"])
    if not noches and len(itinerario) > 1:
        noches = len(itinerario) - 1

    desembarque = None
    if itinerario:
        desembarque = _parse_date(itinerario[-1]["fecha"])
    if not desembarque and embarque and noches:
        desembarque = embarque + timedelta(days=noches)

    puertos = [r for r in itinerario if not r["navegacion"]]
    precio, moneda = _parse_price(lines)

    data = {
        "operador": "Ola" if re.search(r"\bOLA\b|krooze", text, re.IGNORECASE) else "",
        "codigo_presupuesto": _value_after_label(lines, LABELS["codigo_presupuesto"]),
        "naviera": infer_naviera(barco),
        "barco": barco,
        "cabina": cabina,
        "cabina_tamano": tamano,
        "noches": noches,
        "fecha_embarque": _iso(embarque),
        "fecha_desembarque": _iso(desembarque),
        "puerto_embarque": puertos[0]["puerto"] if puertos else "",
        "puerto_desembarque": puertos[-1]["puerto"] if puertos else "",
        "pasajeros": pasajeros,
        "precio": precio,
        "moneda": moneda,
        "paquete_bebidas": _parse_drinks(text),
        "incluye": "",
        "itinerario": itinerario,
    }

    if not (data["barco"] and data["fecha_embarque"] and data["precio"]):
        data = _complete_with_llm(text, data)
        if not data.get("naviera"):
            data["naviera"] = infer_naviera(data.get("barco", ""))

    images = _extract_images(reader)
    data["imagen_mapa"], data["imagen_cabina"] = _classify_images(images)
    data["imagenes"] = [i["data"] for i in images]

    detectados = [k for k in ("barco", "cabina", "noches", "fecha_embarque", "precio", "itinerario")
                  if data.get(k)]
    data["campos_detectados"] = detectados
    return data
