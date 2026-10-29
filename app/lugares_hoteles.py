"""
Normalización de destinos e identificación de hoteles.

- Destinos: se resuelven con la API gratuita de OpenStreetMap (Nominatim) y se
  guardan en la tabla `lugares` con su nombre en español, región y país.
- Hoteles: cada nombre se reduce a una clave ("Hotel Lopesan" y "Lopesan Resort"
  -> "lopesan"); dentro de un mismo lugar, la misma clave (o una casi igual, para
  tolerar errores de tipeo) es el mismo hotel de la tabla `hoteles`.

Tablas: ver scripts/008_lugares_hoteles.sql
"""
import os
import re
import threading
import time
import unicodedata
from datetime import datetime
from difflib import SequenceMatcher

import requests

from app.database import get_supabase_client

TABLE_LUGARES = "lugares"
TABLE_HOTELES_ID = "hoteles"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# La política de uso de Nominatim exige identificar la aplicación y no pasar de 1 consulta por segundo
NOMINATIM_USER_AGENT = os.getenv("GEOCODER_USER_AGENT", "OneTripCotizaciones/1.0 (catalogo de hoteles)")
NOMINATIM_INTERVALO = 1.1
NOMINATIM_TIMEOUT = 6

# Tipos de lugar de OpenStreetMap que aceptamos como destino (el resto son comercios, calles, etc.)
TIPOS_LUGAR = {
    "city": "ciudad", "town": "ciudad", "village": "ciudad", "hamlet": "ciudad",
    "municipality": "ciudad", "suburb": "ciudad", "borough": "ciudad", "quarter": "ciudad",
    "island": "region", "islet": "region", "archipelago": "region", "county": "region",
    "state_district": "region", "state": "region", "province": "region", "region": "region",
    "country": "pais",
}

# Palabras que no identifican al hotel: "Hotel Lopesan" y "Lopesan Resort & Spa" son el mismo
PALABRAS_GENERICAS = {
    "hotel", "hoteles", "hotels", "resort", "resorts", "spa", "y", "and", "the",
    "el", "la", "los", "las", "de", "del", "by", "all", "inclusive", "allinclusive",
    "todo", "incluido", "adults", "adult", "only", "solo", "adultos",
}

# Similitud mínima entre claves para considerar que es el mismo hotel con un error de tipeo
SIMILITUD_MINIMA = 0.88
LARGO_MINIMO_SIMILITUD = 5

# Abreviaturas habituales al escribir destinos, que la API no entiende ("pta cana")
ABREVIATURAS_DESTINO = {
    "pta": "punta", "pto": "puerto", "sta": "santa", "sto": "santo", "s": "san",
    "rep": "republica", "dom": "dominicana", "bs": "buenos", "as": "aires",
}

_nominatim_lock = threading.Lock()
_nominatim_ultima = 0.0


# ──────────────────────────────────────────────────────────────────────────────
# Normalización de texto
# ──────────────────────────────────────────────────────────────────────────────

def _sin_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")

def _tokens(texto: str) -> list:
    texto = _sin_acentos(str(texto or "")).lower().replace("&", " y ")
    return re.findall(r"[a-z0-9]+", texto)

def clave_destino(texto: str) -> str:
    """'  Punta  Caná ' -> 'punta cana'."""
    return " ".join(_tokens(texto))

def expandir_abreviaturas(texto: str) -> str:
    """'Pta. Cana' -> 'punta cana'. Solo para consultar la API: el alias se guarda con lo que se escribió."""
    return " ".join(ABREVIATURAS_DESTINO.get(t, t) for t in _tokens(texto))

def clave_hotel(nombre: str) -> str:
    """'Hotel Lopesan' y 'Lopesan Resort & Spa' -> 'lopesan'. El orden de las palabras no importa."""
    tokens = _tokens(nombre)
    utiles = [t for t in tokens if t not in PALABRAS_GENERICAS] or tokens
    return " ".join(sorted(set(utiles)))

def titulo(texto: str) -> str:
    """Respeta lo que el usuario escribió con mayúsculas; si todo está en minúscula o mayúscula, lo capitaliza."""
    texto = re.sub(r"\s+", " ", str(texto or "")).strip()
    if texto and (texto.islower() or texto.isupper()):
        minusculas = {"de", "del", "la", "las", "los", "el", "y", "by", "and", "the"}
        palabras = texto.lower().split(" ")
        return " ".join(p if i and p in minusculas else p[:1].upper() + p[1:] for i, p in enumerate(palabras))
    return texto

def mismo_hotel(clave_a: str, clave_b: str) -> bool:
    if not clave_a or not clave_b:
        return False
    if clave_a == clave_b:
        return True
    if min(len(clave_a), len(clave_b)) < LARGO_MINIMO_SIMILITUD:
        return False
    return SequenceMatcher(None, clave_a, clave_b).ratio() >= SIMILITUD_MINIMA


# ──────────────────────────────────────────────────────────────────────────────
# API de OpenStreetMap (Nominatim)
# ──────────────────────────────────────────────────────────────────────────────

class GeocoderNoDisponible(Exception):
    """La API no respondió (sin conexión, timeout, error del servidor)."""

def buscar_en_nominatim(consulta: str) -> dict | None:
    """Devuelve el destino encontrado ya convertido al formato de `lugares`, o None si no existe."""
    global _nominatim_ultima
    with _nominatim_lock:
        espera = NOMINATIM_INTERVALO - (time.monotonic() - _nominatim_ultima)
        if espera > 0:
            time.sleep(espera)
        try:
            resp = requests.get(
                NOMINATIM_URL,
                params={
                    "q": consulta, "format": "jsonv2", "addressdetails": 1,
                    "accept-language": "es", "limit": 5, "layer": "address",
                },
                headers={"User-Agent": NOMINATIM_USER_AGENT},
                timeout=NOMINATIM_TIMEOUT,
            )
            resp.raise_for_status()
            resultados = resp.json()
        except (requests.RequestException, ValueError) as e:
            raise GeocoderNoDisponible(str(e)) from e
        finally:
            _nominatim_ultima = time.monotonic()

    # Nominatim los ordena por relevancia: el primero que sea un lugar (no un comercio ni una calle)
    for r in resultados:
        tipo = TIPOS_LUGAR.get(r.get("addresstype"))
        if not tipo:
            continue
        address = r.get("address") or {}
        return {
            "nombre": r.get("name") or titulo(consulta),
            "region": "" if tipo == "pais" else (address.get("state") or address.get("province") or address.get("region") or ""),
            "pais": address.get("country") or "",
            "codigo_pais": (address.get("country_code") or "").upper(),
            "tipo": tipo,
            "latitud": float(r["lat"]) if r.get("lat") else None,
            "longitud": float(r["lon"]) if r.get("lon") else None,
            "osm_ref": f"{r.get('osm_type')}/{r.get('osm_id')}",
            "fuente": "nominatim",
        }
    return None


# ──────────────────────────────────────────────────────────────────────────────
# Lugares
# ──────────────────────────────────────────────────────────────────────────────

def _primera_fila(response) -> dict | None:
    return response.data[0] if response and getattr(response, "data", None) else None

def _ahora() -> str:
    return datetime.utcnow().isoformat()

def _agregar_alias(table: str, fila: dict, *alias):
    nuevos = [a for a in alias if a and a not in (fila.get("alias") or [])]
    if not nuevos:
        return fila
    client = get_supabase_client()
    actualizado = _primera_fila(client.table(table).update({
        "alias": (fila.get("alias") or []) + nuevos, "updated_at": _ahora()
    }).eq("id", fila["id"]).execute())
    return actualizado or fila

def normalizar_destino(texto: str) -> dict | None:
    lugar = _normalizar_destino(texto)
    # Un lugar nuevo se suma enseguida a las sugerencias
    if lugar and all(f["id"] != lugar["id"] for f in _sugerencias_cache["filas"]):
        _sugerencias_cache["cargado"] = 0.0
    return lugar

def _normalizar_destino(texto: str) -> dict | None:
    """
    Devuelve la fila de `lugares` del destino (creándola si hace falta), o None si el texto está vacío.
    Si la API no tiene el destino o no responde, se guarda tal como lo escribió el usuario, para
    que los hoteles igual se puedan agrupar por destino.
    """
    clave = clave_destino(texto)
    client = get_supabase_client()
    if not clave or not client:
        return None

    response = client.table(TABLE_LUGARES).select("*").contains("alias", [clave]).execute()
    filas = response.data if response and response.data else []
    # Si la vez anterior la API no respondió, se reintenta; si no lo tenía, se respeta lo guardado
    resuelto = next((f for f in filas if f.get("fuente") != "pendiente"), None)
    if resuelto:
        return resuelto
    cacheado = filas[0] if filas else None

    try:
        encontrado = buscar_en_nominatim(expandir_abreviaturas(texto))
        fuente_sin_datos = "manual"
    except GeocoderNoDisponible as e:
        print(f"Lugares: la API de OpenStreetMap no respondió para '{texto}': {e}")
        encontrado = None
        fuente_sin_datos = "pendiente"

    if not encontrado:
        if cacheado:
            return cacheado
        return _primera_fila(client.table(TABLE_LUGARES).insert({
            "nombre": titulo(texto), "fuente": fuente_sin_datos, "alias": [clave], "updated_at": _ahora(),
        }).execute())

    # El mismo lugar puede llegar con otra búsqueda ("cancun" y "cancún, mexico")
    existente = _primera_fila(client.table(TABLE_LUGARES).select("*").eq("osm_ref", encontrado["osm_ref"]).limit(1).execute())
    if existente:
        return _agregar_alias(TABLE_LUGARES, existente, clave, clave_destino(encontrado["nombre"]))

    alias = sorted({clave, clave_destino(encontrado["nombre"])})
    if cacheado:
        # Lugar que había quedado pendiente: se completa con los datos de la API
        return _primera_fila(client.table(TABLE_LUGARES).update({
            **encontrado, "alias": sorted(set(cacheado.get("alias") or []) | set(alias)), "updated_at": _ahora(),
        }).eq("id", cacheado["id"]).execute()) or cacheado
    return _primera_fila(client.table(TABLE_LUGARES).insert({**encontrado, "alias": alias, "updated_at": _ahora()}).execute())

def coincide_con_lo_escrito(texto: str, lugar: dict | None) -> bool:
    """
    True si el lugar es lo que el usuario quiso escribir, con otra ortografía ("pta cana" ->
    "Punta Cana", "cancun, mexico" -> "Cancún"). Evita reemplazar "Salvador" por "El Salvador".
    """
    if not lugar:
        return False
    escrito = clave_destino(expandir_abreviaturas(str(texto or "").split(",")[0]))
    return bool(escrito) and escrito == clave_destino(lugar.get("nombre"))


# Los lugares ya normalizados se usan para sugerir mientras se escribe: la API de
# OpenStreetMap no permite autocompletar con cada tecla, se la consulta solo al confirmar.
SUGERENCIAS_TTL = 120
_sugerencias_cache = {"filas": [], "cargado": 0.0}

def _lugares_para_sugerir() -> list:
    if time.monotonic() - _sugerencias_cache["cargado"] > SUGERENCIAS_TTL:
        client = get_supabase_client()
        response = client.table(TABLE_LUGARES).select("id, nombre, region, pais, codigo_pais, tipo, alias").execute()
        _sugerencias_cache["filas"] = response.data or []
        _sugerencias_cache["cargado"] = time.monotonic()
    return _sugerencias_cache["filas"]

def sugerir_lugares(texto: str, limite: int = 6) -> list:
    """Lugares guardados cuyo nombre (o una búsqueda ya resuelta) empieza o contiene lo escrito."""
    clave = clave_destino(expandir_abreviaturas(texto))
    if len(clave) < 2:
        return []
    puntajes = []
    for lugar in _lugares_para_sugerir():
        nombre = clave_destino(lugar.get("nombre"))
        claves = [nombre] + list(lugar.get("alias") or [])
        if nombre.startswith(clave):
            puntaje = 0
        elif any(c.startswith(clave) for c in claves):
            puntaje = 1
        elif any(f" {clave}" in f" {c}" for c in claves):
            puntaje = 2
        else:
            continue
        orden_tipo = {"ciudad": 0, "region": 1, "pais": 2}.get(lugar.get("tipo"), 3)
        puntajes.append(((puntaje, orden_tipo, len(nombre)), lugar))
    puntajes.sort(key=lambda p: p[0])
    return [{k: v for k, v in lugar.items() if k != "alias"} for _, lugar in puntajes[:limite]]

def describir_lugar(lugar: dict | None) -> str:
    """'Punta Cana, República Dominicana'."""
    if not lugar:
        return ""
    if lugar.get("tipo") == "pais" or not lugar.get("pais"):
        return lugar.get("nombre") or ""
    return f"{lugar['nombre']}, {lugar['pais']}"


# ──────────────────────────────────────────────────────────────────────────────
# Hoteles
# ──────────────────────────────────────────────────────────────────────────────

def _hoteles_del_lugar(lugar_id) -> list:
    query = get_supabase_client().table(TABLE_HOTELES_ID).select("*")
    query = query.eq("lugar_id", lugar_id) if lugar_id else query.is_("lugar_id", "null")
    response = query.execute()
    return response.data if response and response.data else []

def buscar_hotel(nombre: str, lugar_id=None) -> dict | None:
    """El hotel ya registrado en ese lugar con el mismo nombre normalizado (o casi igual), si existe."""
    clave = clave_hotel(nombre)
    if not clave:
        return None
    candidatos = _hoteles_del_lugar(lugar_id)
    exacto = next((h for h in candidatos if h["nombre_normalizado"] == clave), None)
    if exacto:
        return exacto
    parecidos = [h for h in candidatos if mismo_hotel(clave, h["nombre_normalizado"])]
    return max(parecidos, key=lambda h: SequenceMatcher(None, clave, h["nombre_normalizado"]).ratio(), default=None)

def identificar_hotel(nombre: str, lugar_id=None, hotel_actual_id=None) -> dict | None:
    """
    Devuelve la fila de `hoteles` que corresponde al nombre en ese lugar, creándola si es nueva.

    `hotel_actual_id` es el hotel al que ya apuntaba la ficha que se está editando: si el
    nuevo nombre tiene la misma clave (solo cambian mayúsculas, acentos o palabras como
    "Hotel"/"Resort"), se toma como una corrección y pasa a ser el nombre estándar.
    """
    nombre = re.sub(r"\s+", " ", str(nombre or "")).strip()
    clave = clave_hotel(nombre)
    client = get_supabase_client()
    if not clave or not client:
        return None

    hotel = buscar_hotel(nombre, lugar_id)
    if hotel:
        if hotel_actual_id and str(hotel["id"]) == str(hotel_actual_id) and hotel["nombre_normalizado"] == clave \
                and nombre != hotel["nombre"]:
            corregido = _primera_fila(client.table(TABLE_HOTELES_ID).update({
                "nombre": titulo(nombre), "updated_at": _ahora()
            }).eq("id", hotel["id"]).execute())
            hotel = corregido or hotel
        return _agregar_alias(TABLE_HOTELES_ID, hotel, nombre)

    try:
        return _primera_fila(client.table(TABLE_HOTELES_ID).insert({
            "nombre": titulo(nombre), "nombre_normalizado": clave, "lugar_id": lugar_id,
            "alias": [nombre], "updated_at": _ahora(),
        }).execute())
    except Exception as e:
        # Otra solicitud lo creó al mismo tiempo (índice único lugar + nombre normalizado)
        print(f"Hoteles: no se pudo crear '{nombre}', se reintenta la búsqueda: {e}")
        return buscar_hotel(nombre, lugar_id)
