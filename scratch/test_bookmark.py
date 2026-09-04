import sys
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.pdf_generator import generate_pdf
import fitz # PyMuPDF

def test():
    dummy_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

    data = {
        "nombre_pax": "Carlos Mendoza",
        "destino": "Río de Janeiro y Búzios",
        "cantidad_pasajeros": 2,
        "tipo_cotizacion": "multidestino",
        "fecha_salida": "10/11/2026",
        "origen": "Córdoba",
        "fecha_vuelo_ida": "10/11/2026",
        "fecha_vuelo_3": "14/11/2026",
        "fecha_vuelo_vuelta": "19/11/2026",
        "img_vuelo_ida": dummy_b64,
        "img_vuelo_3": dummy_b64,
        "img_vuelo_vuelta": dummy_b64,
        "noches_alojamiento": "9 noches",
        "base_habitacion": "Doble",
        "tipo_traslado": "tradicional",
        "monto_traslados": 240.0,
        "costo_total": 3450.0,
        "precio_persona": 1725.0,
        "detalle_vuelo_completo": "Vuelos confirmados con equipaje.",
        "equipaje": ["Mano", "Carry-on", "Valija"],
        "hoteles": [
            {
                "nombre": "Windsor Copa Hotel",
                "destino": "Río de Janeiro",
                "estrellas": "★★★★",
                "noches_alojamiento": "4 noches",
                "noches": 4,
                "fecha_checkin": "10/11/2026",
                "fecha_checkout": "14/11/2026",
                "descripcion": "Ubicado a 2 cuadras de la playa de Copacabana, con piscina y desayuno buffet.",
                "regimen": "Desayuno",
                "habitacion": "Superior",
                "costo": 1200.0,
                "precio_persona": 600.0,
                "imagen": dummy_b64
            },
            {
                "nombre": "Serena Boutique Resort",
                "destino": "Búzios",
                "estrellas": "★★★★",
                "noches_alojamiento": "5 noches",
                "noches": 5,
                "fecha_checkin": "14/11/2026",
                "fecha_checkout": "19/11/2026",
                "descripcion": "A pasos de playa Geribá, resort boutique con jardines tropicales y alta gastronomía.",
                "regimen": "Media Pensión",
                "habitacion": "Suite Jardín",
                "costo": 1600.0,
                "precio_persona": 800.0,
                "imagen": dummy_b64
            }
        ]
    }

    pdf_bytes = generate_pdf(data)
    out_pdf = BASE_DIR / "scratch" / "test_multidestino_bookmark.pdf"
    with open(out_pdf, "wb") as f:
        f.write(pdf_bytes)
    print(f"Generated PDF: {out_pdf}")

    doc = fitz.open(out_pdf)
    print(f"Total pages: {len(doc)}")
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=150)
        img_path = BASE_DIR / "scratch" / f"page_{i+1}.png"
        pix.save(str(img_path))
        print(f"Saved page {i+1} as {img_path}")

if __name__ == "__main__":
    test()
