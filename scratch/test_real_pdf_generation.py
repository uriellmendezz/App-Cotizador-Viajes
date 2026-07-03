import sys
import os
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.pdf_generator import generate_pdf

def main():
    print("Testing real PDF generation with WeasyPrint...")
    
    # Mock data structure matching generate_pdf requirements
    data = {
        "nombre_pax": "Juan Pérez",
        "destino": "Cancún, México",
        "cantidad_pasajeros": 2,
        "fecha_salida": "15/12/2026",
        "origen": "Córdoba",
        "fecha_vuelo_ida": "15/12/2026",
        "fecha_vuelo_vuelta": "22/12/2026",
        "noches_alojamiento": "7 noches",
        "base_habitacion": "Doble",
        "detalle_vuelo_completo": "Vuelos desde Córdoba a Cancún. Incluye equipaje de mano y valija (23kg).",
        "hoteles": [
            {
                "nombre": "Grand Oasis Cancun",
                "estrellas": "★★★★",
                "descripcion": "Resort todo incluido en la zona hotelera de Cancún con excelentes playas y actividades.",
                "regimen": "All Inclusive",
                "habitacion": "Estándar Vista al Mar",
                "costo": 2400.0,
                "precio_persona": 1200.0
            }
        ]
    }
    
    try:
        pdf_bytes = generate_pdf(data)
        out_path = BASE_DIR / "scratch" / "test_output.pdf"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "wb") as f:
            f.write(pdf_bytes)
        print(f"[SUCCESS] PDF generated successfully at {out_path}")
    except Exception as e:
        print(f"[FAIL] Error generating PDF: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
