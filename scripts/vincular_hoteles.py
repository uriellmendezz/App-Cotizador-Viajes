"""
Vincula las fichas ya cargadas en `hoteles_catalogo` con las tablas `lugares` y `hoteles`
(requiere haber corrido scripts/008_lugares_hoteles.sql).

    py scripts/vincular_hoteles.py            -> solo muestra qué fichas se agruparían (no escribe nada)
    py scripts/vincular_hoteles.py --aplicar  -> normaliza destinos, identifica hoteles y actualiza las fichas

Con --aplicar se consulta la API de OpenStreetMap una vez por destino distinto (máx. 1 por segundo).
Las fichas repetidas de una misma sucursal no se borran: se listan al final para revisarlas.
"""
import os
import sys
from collections import defaultdict

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from app.database import get_supabase_client, TABLE_HOTELES
from app.lugares_hoteles import clave_destino, clave_hotel, normalizar_destino, identificar_hotel


def leer_fichas(client) -> list:
    # Sin la columna `fotos`: pesa varios MB por ficha
    response = client.table(TABLE_HOTELES).select("id, nombre, destino, hotel_id, sucursal_id, agente_id").order("id").execute()
    return response.data or []


def vista_previa(fichas: list):
    grupos = defaultdict(list)
    for f in fichas:
        grupos[(clave_destino(f.get("destino")), clave_hotel(f.get("nombre")))].append(f)
    repetidos = {k: v for k, v in grupos.items() if len(v) > 1}
    print(f"{len(fichas)} fichas, {len(grupos)} hoteles distintos por nombre y destino exactos.")
    for (destino, _), filas in repetidos.items():
        nombres = ", ".join(f'#{f["id"]} "{f["nombre"]}"' for f in filas)
        print(f"  [{destino or 'sin destino'}] {nombres}")
    print("\nCon --aplicar además se unifican destinos escritos distinto y nombres con errores de tipeo.")


def aplicar(client, fichas: list):
    por_sucursal = defaultdict(list)
    for f in fichas:
        lugar = normalizar_destino(f.get("destino") or "")
        hotel = identificar_hotel(f.get("nombre") or "", lugar["id"] if lugar else None, f.get("hotel_id"))
        if not hotel:
            print(f'  #{f["id"]} "{f["nombre"]}": sin nombre válido, se omite')
            continue
        cambios = {"hotel_id": hotel["id"], "nombre": hotel["nombre"]}
        if lugar:
            cambios["destino"] = lugar["nombre"]
        client.table(TABLE_HOTELES).update(cambios).eq("id", f["id"]).execute()
        print(f'  #{f["id"]} "{f["nombre"]}" ({f.get("destino") or "-"}) -> hotel #{hotel["id"]} "{hotel["nombre"]}" ({cambios.get("destino", "-")})')
        por_sucursal[(f.get("sucursal_id") or f.get("agente_id"), hotel["id"])].append(f)

    repetidos = [filas for filas in por_sucursal.values() if len(filas) > 1]
    if repetidos:
        print("\nFichas del mismo hotel repetidas dentro de una sucursal (revisalas en Configuración):")
        for filas in repetidos:
            print("  " + ", ".join(f'#{f["id"]} "{f["nombre"]}"' for f in filas))


def main():
    client = get_supabase_client()
    if not client:
        sys.exit("Falta configurar SUPABASE_URL y SUPABASE_KEY en el .env")
    fichas = leer_fichas(client)
    if "--aplicar" in sys.argv:
        aplicar(client, fichas)
    else:
        vista_previa(fichas)


if __name__ == "__main__":
    main()
