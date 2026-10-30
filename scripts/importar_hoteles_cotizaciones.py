"""
Arma el Catálogo de Hoteles a partir de los alojamientos cargados en todas las cotizaciones.

    py scripts/importar_hoteles_cotizaciones.py            -> solo muestra lo que haría (no escribe nada)
    py scripts/importar_hoteles_cotizaciones.py --aplicar  -> crea, completa y depura las fichas del catálogo

Para cada sucursal:
1. Lee los hoteles de todas sus cotizaciones (estándar, multidestino, grupal, crucero y rápidas)
   y las fichas que ya tiene el catálogo.
2. Agrupa las versiones del mismo hotel en el mismo destino ("Hotel Lopesan" y "Lopesan Resort"
   en "Pta Cana" y "Punta Cana" son el mismo), igual que lo hace el catálogo al guardar.
3. Se queda con la mejor versión de cada hotel: la más completa (foto, descripción, régimen,
   habitación, categoría), priorizando lo que el agente ya cargó en el catálogo y, a igualdad,
   la más reciente. Los datos que le falten se completan con las otras versiones y se juntan
   hasta 6 fotos distintas.
4. Con --aplicar: crea las fichas nuevas, completa las existentes y elimina las fichas repetidas
   del mismo hotel (sus datos y fotos quedan en la ficha que se conserva).

Requiere scripts/008_lugares_hoteles.sql. Con --aplicar se consulta la API de OpenStreetMap una
vez por destino nuevo (máx. 1 por segundo), por eso puede tardar unos minutos la primera vez.
"""
import os
import re
import sys
import time
from collections import defaultdict

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from app.database import get_supabase_client, TABLE_HOTELES
from app.lugares_hoteles import (
    clave_destino, clave_hotel, expandir_abreviaturas, mismo_hotel, titulo,
    normalizar_destino, identificar_hotel,
)

MAX_FOTOS = 6
MAX_DESCRIPCION = 200
DATA_IMAGE_RE = re.compile(r"^data:image/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$")
# Nombres por defecto de los formularios, que no identifican a ningún hotel
NOMBRE_GENERICO_RE = re.compile(
    r"^(hotel|alojamiento|opci[oó]n|parada)(\s+(adicional|seleccionado|(parada\s+)?\d+|en\s+.*))?$", re.I)
METADATA = {"METADATA_COTIZACION", "METADATA_PRESUPUESTO_RAPIDO"}
COLUMNAS_COTIZACION = "id, destino, sucursal_id, agente_id, agente_nombre, created_at, base_habitacion, hoteles"
LOTE = 5


# ──────────────────────────────────────────────────────────────────────────────
# Lectura
# ──────────────────────────────────────────────────────────────────────────────

def _ejecutar(consulta, intentos=3):
    for intento in range(intentos):
        try:
            return consulta.execute().data or []
        except Exception as e:
            if intento == intentos - 1:
                raise
            print(f"  reintentando ({e})...")
            time.sleep(2 * (intento + 1))


def leer_cotizaciones(client, omitidas: list):
    """
    Las cotizaciones de a pocas: la columna `hoteles` lleva las fotos en base64 y la tabla pesa
    cientos de MB. Primero los ids (consulta liviana) y después cada lote; si un lote supera el
    timeout se lee de a una, y la que igual no se puede leer se informa al final.
    """
    ids = [f["id"] for f in _paginar(lambda: client.table("cotizaciones").select("id").order("id"))]
    print(f"{len(ids)} cotizaciones para revisar.")
    for i in range(0, len(ids), LOTE):
        lote = ids[i:i + LOTE]
        try:
            yield from _ejecutar(client.table("cotizaciones").select(COLUMNAS_COTIZACION).in_("id", lote), intentos=1)
        except Exception:
            for quote_id in lote:
                try:
                    yield from _ejecutar(client.table("cotizaciones").select(COLUMNAS_COTIZACION).eq("id", quote_id))
                except Exception as e:
                    print(f"  no se pudo leer la cotización #{quote_id}: {e}")
                    omitidas.append(quote_id)


def _paginar(nueva_consulta, tam=1000):
    """PostgREST devuelve hasta 1000 filas por consulta (nueva_consulta arma la consulta de cada página)."""
    desde = 0
    while True:
        filas = _ejecutar(nueva_consulta().range(desde, desde + tam - 1))
        yield from filas
        if len(filas) < tam:
            return
        desde += tam


def leer_catalogo(client):
    # Sin las fotos: se piden solo las de las fichas que se van a modificar
    return list(_paginar(lambda: client.table(TABLE_HOTELES).select(
        "id, nombre, destino, estrellas, regimen, habitacion, descripcion, hotel_id, "
        "sucursal_id, agente_id, agente_nombre, updated_at").order("id")))


# ──────────────────────────────────────────────────────────────────────────────
# Versiones de cada hotel
# ──────────────────────────────────────────────────────────────────────────────

def _estrellas(valor) -> int:
    texto = str(valor or "")
    digito = re.search(r"[1-5]", texto)
    if digito:
        return int(digito.group())
    return min(5, texto.count("★"))


def _limpiar(texto) -> str:
    return re.sub(r"\s+", " ", str(texto or "")).strip()


def versiones_de_cotizacion(fila: dict) -> list:
    hoteles = fila.get("hoteles") or []
    if not isinstance(hoteles, list):
        return []
    rapida = fila.get("base_habitacion") == "PRESUPUESTO_RAPIDO"
    metadata = next((h for h in hoteles if isinstance(h, dict) and h.get("nombre") in METADATA), {})
    destino_cotizacion = _limpiar(fila.get("destino") or metadata.get("destino"))

    versiones = []
    for h in hoteles:
        if not isinstance(h, dict) or h.get("nombre") in METADATA:
            continue
        # En las rápidas la lista mezcla alojamientos y traslados: solo los alojamientos tienen estrellas
        if rapida and "estrellas" not in h:
            continue
        nombre = _limpiar(h.get("nombre"))
        if len(nombre) < 3 or NOMBRE_GENERICO_RE.match(nombre):
            continue
        # Multidestino: destino de la parada; crucero: ciudad del hotel pre/post
        destino = _limpiar(h.get("destino") or h.get("ciudad") or destino_cotizacion)
        if re.match(r"^parada \d+$", destino, re.I):
            destino = destino_cotizacion
        foto = h.get("imagen1") or h.get("imagen") or ""
        versiones.append({
            "origen": f"cotización #{fila['id']}",
            "catalogo_id": None,
            "nombre": nombre,
            "destino": destino,
            "estrellas": _estrellas(h.get("estrellas")),
            "regimen": _limpiar(h.get("regimen")),
            "habitacion": _limpiar(h.get("habitacion")),
            "descripcion": str(h.get("descripcion") or "").strip()[:MAX_DESCRIPCION],
            "fotos": [foto] if DATA_IMAGE_RE.match(str(foto)) else [],
            "fecha": fila.get("created_at") or "",
            "sucursal_id": fila.get("sucursal_id"),
            "agente_id": fila.get("agente_id"),
            "agente_nombre": fila.get("agente_nombre"),
        })
    return versiones


def version_de_ficha(ficha: dict) -> dict:
    return {
        "origen": f"catálogo #{ficha['id']}",
        "catalogo_id": ficha["id"],
        "hotel_id": ficha.get("hotel_id"),
        "nombre": _limpiar(ficha.get("nombre")),
        "destino": _limpiar(ficha.get("destino")),
        "estrellas": int(ficha.get("estrellas") or 0),
        "regimen": _limpiar(ficha.get("regimen")),
        "habitacion": _limpiar(ficha.get("habitacion")),
        "descripcion": str(ficha.get("descripcion") or "").strip(),
        "fotos": None,  # se cargan solo si hace falta
        "fecha": ficha.get("updated_at") or "",
        "sucursal_id": ficha.get("sucursal_id"),
        "agente_id": ficha.get("agente_id"),
        "agente_nombre": ficha.get("agente_nombre"),
    }


def puntaje(v: dict) -> tuple:
    """Más completa primero; a igualdad, la del catálogo (la revisó un agente) y la más reciente."""
    completitud = (
        (3 if v["fotos"] or v["catalogo_id"] else 0)
        + min(len(v["descripcion"]), MAX_DESCRIPCION) / 100
        + (1 if v["regimen"] else 0)
        + (0.5 if v["habitacion"] else 0)
        + (0.5 if v["estrellas"] else 0)
    )
    return (completitud, 1 if v["catalogo_id"] else 0, v["fecha"])


# ──────────────────────────────────────────────────────────────────────────────
# Agrupado
# ──────────────────────────────────────────────────────────────────────────────

def clave_lugar(destino: str) -> str:
    return clave_destino(expandir_abreviaturas(destino.split(",")[0])) if destino else ""


def agrupar(versiones: list) -> list:
    """Mismo destino escrito igual (salvo abreviaturas) y mismo nombre de hotel (o casi igual)."""
    grupos = []  # [(clave_lugar, clave_hotel, [versiones])]
    for v in versiones:
        lugar, hotel = clave_lugar(v["destino"]), clave_hotel(v["nombre"])
        grupo = next((g for g in grupos if g[0] == lugar and mismo_hotel(hotel, g[1])), None)
        if grupo:
            grupo[2].append(v)
        else:
            grupos.append((lugar, hotel, [v]))
    return [g[2] for g in grupos]


def unir_por_hotel_identificado(grupos: list) -> list:
    """Con --aplicar: identifica cada grupo en `lugares`/`hoteles` y une los que resultan ser el mismo hotel."""
    por_hotel = {}
    sueltos = []
    for versiones in grupos:
        mejor = max(versiones, key=puntaje)
        lugar = normalizar_destino(mejor["destino"]) if mejor["destino"] else None
        actual = next((v.get("hotel_id") for v in versiones if v.get("hotel_id")), None)
        hotel = identificar_hotel(mejor["nombre"], lugar["id"] if lugar else None, actual)
        for v in versiones:
            v["lugar"] = lugar
            v["hotel"] = hotel
        if hotel:
            por_hotel.setdefault(hotel["id"], []).extend(versiones)
        else:
            sueltos.append(versiones)
    return list(por_hotel.values()) + sueltos


# ──────────────────────────────────────────────────────────────────────────────
# Mejor versión
# ──────────────────────────────────────────────────────────────────────────────

def fotos_de_ficha(client, ficha_id, cache={}):
    if ficha_id not in cache:
        filas = _ejecutar(client.table(TABLE_HOTELES).select("fotos").eq("id", ficha_id))
        cache[ficha_id] = [f for f in ((filas[0].get("fotos") if filas else None) or []) if DATA_IMAGE_RE.match(str(f))]
    return cache[ficha_id]


def mejor_version(client, versiones: list) -> dict:
    ordenadas = sorted(versiones, key=puntaje, reverse=True)
    mejor = dict(ordenadas[0])
    for v in ordenadas[1:]:
        for campo in ("regimen", "habitacion", "descripcion"):
            if not mejor[campo] and v[campo]:
                mejor[campo] = v[campo]
        if not mejor["estrellas"] and v["estrellas"]:
            mejor["estrellas"] = v["estrellas"]

    fotos = []
    for v in ordenadas:
        propias = fotos_de_ficha(client, v["catalogo_id"]) if v["catalogo_id"] else v["fotos"]
        for f in propias:
            if f not in fotos and len(fotos) < MAX_FOTOS:
                fotos.append(f)
    mejor["fotos"] = fotos

    hotel = mejor.get("hotel")
    lugar = mejor.get("lugar")
    mejor["nombre"] = hotel["nombre"] if hotel else titulo(mejor["nombre"])
    mejor["destino"] = lugar["nombre"] if lugar else titulo(mejor["destino"])
    mejor["hotel_id"] = hotel["id"] if hotel else None
    return mejor


def hay_cambios(client, actual: dict, mejor: dict) -> bool:
    """True si la mejor versión le agrega o corrige algo a la ficha que ya está en el catálogo."""
    nueva = ficha(mejor)
    for campo in ("nombre", "destino", "regimen", "habitacion", "descripcion"):
        if nueva[campo] != actual[campo]:
            return True
    if nueva["estrellas"] != (actual["estrellas"] or 4):
        return True
    return nueva["fotos"] != fotos_de_ficha(client, actual["catalogo_id"])


def ficha(mejor: dict) -> dict:
    datos = {
        "nombre": mejor["nombre"],
        "destino": mejor["destino"],
        "estrellas": min(5, max(1, mejor["estrellas"] or 4)),
        "regimen": mejor["regimen"],
        "habitacion": mejor["habitacion"],
        "descripcion": mejor["descripcion"][:MAX_DESCRIPCION],
        "fotos": mejor["fotos"],
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
    }
    if mejor.get("hotel_id"):
        datos["hotel_id"] = mejor["hotel_id"]
    return datos


# ──────────────────────────────────────────────────────────────────────────────
# Principal
# ──────────────────────────────────────────────────────────────────────────────

def main():
    aplicar = "--aplicar" in sys.argv
    client = get_supabase_client()
    if not client:
        sys.exit("Falta configurar SUPABASE_URL y SUPABASE_KEY en el .env")

    print("Leyendo cotizaciones (puede tardar)...")
    por_sucursal = defaultdict(list)
    total_cotizaciones = 0
    omitidas = []
    for fila in leer_cotizaciones(client, omitidas):
        total_cotizaciones += 1
        for v in versiones_de_cotizacion(fila):
            por_sucursal[v["sucursal_id"] or f"agente:{v['agente_id']}"].append(v)
        if total_cotizaciones % 200 == 0:
            print(f"  {total_cotizaciones} cotizaciones leídas...")
    menciones = sum(len(v) for v in por_sucursal.values())
    print(f"{total_cotizaciones} cotizaciones leídas, {menciones} alojamientos cargados.")
    if omitidas:
        print(f"No se pudieron leer {len(omitidas)} cotizaciones: {', '.join(f'#{i}' for i in omitidas)}")

    catalogo = leer_catalogo(client)
    for f in catalogo:
        por_sucursal[f.get("sucursal_id") or f"agente:{f.get('agente_id')}"].append(version_de_ficha(f))
    print(f"{len(catalogo)} fichas en el catálogo.\n")

    resumen = {"nuevas": 0, "actualizadas": 0, "eliminadas": 0, "sin_cambios": 0}
    for sucursal, versiones in por_sucursal.items():
        grupos = agrupar(versiones)
        if aplicar:
            grupos = unir_por_hotel_identificado(grupos)
        print(f"── Sucursal {sucursal}: {len(versiones)} versiones -> {len(grupos)} hoteles")

        for grupo in sorted(grupos, key=lambda g: (g[0]["destino"].lower(), g[0]["nombre"].lower())):
            fichas = {v["catalogo_id"]: v for v in grupo if v["catalogo_id"]}
            desde_cotizaciones = [v for v in grupo if not v["catalogo_id"]]
            if len(fichas) == 1 and not desde_cotizaciones:
                resumen["sin_cambios"] += 1
                continue
            mejor = mejor_version(client, grupo)
            etiqueta = f'"{mejor["nombre"]}" ({mejor["destino"] or "sin destino"})'

            # Se conserva la ficha de la mejor versión si es del catálogo; si no, la más antigua
            conservar = mejor["catalogo_id"] or (min(fichas) if fichas else None)
            repetidas = sorted(f for f in fichas if f != conservar)
            accion = "nueva" if not fichas else "actualizar"
            if accion == "actualizar" and not repetidas and not hay_cambios(client, fichas[conservar], mejor):
                resumen["sin_cambios"] += 1
                continue
            detalle = f"{len(desde_cotizaciones)} versiones en cotizaciones, mejor: {mejor['origen']}"
            if accion == "nueva":
                print(f"  + {etiqueta}: {detalle}")
            else:
                extra = f", une las fichas repetidas {', '.join(f'#{f}' for f in repetidas)}" if repetidas else ""
                print(f"  ~ {etiqueta} (ficha #{conservar}): {detalle}{extra}")

            if not aplicar:
                resumen["nuevas" if accion == "nueva" else "actualizadas"] += 1
                resumen["eliminadas"] += len(repetidas)
                continue

            datos = ficha(mejor)
            if accion == "nueva":
                autor = max(grupo, key=lambda v: v["fecha"])
                datos.update({"sucursal_id": autor["sucursal_id"], "agente_id": autor["agente_id"],
                              "agente_nombre": autor["agente_nombre"]})
                _ejecutar(client.table(TABLE_HOTELES).insert(datos))
                resumen["nuevas"] += 1
            else:
                _ejecutar(client.table(TABLE_HOTELES).update(datos).eq("id", conservar))
                resumen["actualizadas"] += 1
                for repetida in repetidas:
                    _ejecutar(client.table(TABLE_HOTELES).delete().eq("id", repetida))
                    resumen["eliminadas"] += 1

    print()
    verbo = "Se" if aplicar else "Se harían"
    print(f"{verbo}: {resumen['nuevas']} fichas nuevas, {resumen['actualizadas']} completadas/unificadas, "
          f"{resumen['eliminadas']} fichas repetidas eliminadas, {resumen['sin_cambios']} sin cambios.")
    if not aplicar:
        print("\nEs una vista previa: no se escribió nada. Corré con --aplicar para guardar los cambios.")
        print("Con --aplicar además se unifican destinos escritos distinto (\"Cancún\" y \"Cancun, México\").")


if __name__ == "__main__":
    main()
