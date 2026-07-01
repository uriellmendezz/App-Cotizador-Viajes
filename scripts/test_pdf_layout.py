import sys
import os
from jinja2 import Environment, FileSystemLoader
from pathlib import Path

# Path setup
BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"
TEMPLATE_NAME = "cotizacion_pdf_v2.html"

def test_layout_shift():
    print("=" * 60)
    print("TEST: PDF Flights Layout Shift (Jinja Conditional)")
    print("=" * 60)
    
    if not (TEMPLATES_DIR / TEMPLATE_NAME).exists():
        print(f"  [FAIL] Template not found at: {TEMPLATES_DIR / TEMPLATE_NAME}")
        return False

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=False,
    )
    template = env.get_template(TEMPLATE_NAME)

    # 1. Test with exactly 1 hotel
    print("  Step 1: Rendering with exactly 1 hotel option...")
    context_1_hotel = {
        "hoteles": [{"nombre": "Hotel Test 1", "stars_count": 4, "habitacion": "Std", "regimen": "All Inclusive", "costo": 1000.0, "precio_persona": 500.0}],
        "destino": "Test Dest",
        "nombre_pax": "Test Pax",
        "fecha_salida": "10/10/2026",
        "fecha_vuelo_ida": "10/10/2026",
        "fecha_vuelo_vuelta": "17/10/2026",
        "equipaje": [],
        "noches_alojamiento": "7 noches",
        "base_habitacion": "Doble",
        "format_price": lambda x: f"{x:.2f}"
    }
    
    html_1_hotel = template.render(**context_1_hotel)
    
    # We expect "flights-stacked" to be present in the HTML class of flights-row
    if "class=\"flights-row flights-stacked\"" in html_1_hotel:
        print("  [OK] Found 'flights-stacked' in single-hotel template output.")
    else:
        print("  [FAIL] 'flights-stacked' NOT found in HTML when there is only 1 hotel!")
        return False

    # 2. Test with 2 hotels
    print("\n  Step 2: Rendering with 2 hotel options...")
    context_2_hotels = {
        "hoteles": [
            {"nombre": "Hotel Test 1", "stars_count": 4, "habitacion": "Std", "regimen": "All Inclusive", "costo": 1000.0, "precio_persona": 500.0},
            {"nombre": "Hotel Test 2", "stars_count": 5, "habitacion": "Superior", "regimen": "Desayuno", "costo": 1200.0, "precio_persona": 600.0}
        ],
        "destino": "Test Dest",
        "nombre_pax": "Test Pax",
        "fecha_salida": "10/10/2026",
        "fecha_vuelo_ida": "10/10/2026",
        "fecha_vuelo_vuelta": "17/10/2026",
        "equipaje": [],
        "noches_alojamiento": "7 noches",
        "base_habitacion": "Doble",
        "format_price": lambda x: f"{x:.2f}"
    }
    
    html_2_hotels = template.render(**context_2_hotels)
    
    # We expect "flights-stacked" to NOT be present in the HTML class
    if "class=\"flights-row flights-stacked\"" not in html_2_hotels:
        print("  [OK] Correctly omitted 'flights-stacked' when there is more than 1 hotel.")
    else:
        print("  [FAIL] 'flights-stacked' was incorrectly included in HTML when there are 2 hotels!")
        return False

    print("\n>> Layout shift Jinja rules validated successfully!")
    return True

if __name__ == "__main__":
    success = test_layout_shift()
    sys.exit(0 if success else 1)
