import requests
import os
import sys

# Setup base directory dynamic path resolution and add to sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

BASE_URL = "http://127.0.0.1:8000"

# Test JSON payload (no images - testing pure generation pipeline)
quote = {
    "nombre_pax": "Mariana Lopez",
    "cantidad_pasajeros": 2,
    "destino": "Punta Cana",
    "fecha_salida": "20/11/2024",
    "origen": "Córdoba",
    "agente_nombre": "Uriel",
    "monto_vuelos": 1500.0,
    "fee_aereo_percent": 10.0,
    "fee_aereo": 150.0,
    "monto_traslados": 200.0,
    "gastos_iva": 0.0,
    "fecha_vuelo_ida": "20/11/2024",
    "fecha_vuelo_vuelta": "27/11/2024",
    "hoteles": [
        {
            "nombre": "Iberostar Selection",
            "descripcion": "Complejo all-inclusive frente al mar, ideal para familias y parejas.",
            "estrellas": "★★★★★",
            "regimen": "All Inclusive",
            "habitacion": "Suite Estándar",
            "costo": 2750.0
        }
    ]
}

def test_config():
    """Test GET /api/config"""
    print("=" * 60)
    print("TEST 1: GET /api/config")
    print("=" * 60)
    try:
        res = requests.get(f"{BASE_URL}/api/config")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        data = res.json()
        assert "nombre_agencia" in data, "Missing 'nombre_agencia' in config"
        assert "colores" in data, "Missing 'colores' in config"
        print(f"  [OK] Config loaded: {data['nombre_agencia']}")
        print(f"  [OK] Colors: {data['colores']}")
        return True
    except Exception as e:
        print(f"  [FAIL] FAILED: {e}")
        return False

def test_cotizar():
    """Test POST /api/cotizar - Google Slides presentation generation"""
    print()
    print("=" * 60)
    print("TEST 2: POST /api/cotizar (Google Slides generation)")
    print("=" * 60)
    try:
        res = requests.post(f"{BASE_URL}/api/cotizar", json=quote)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        
        data = res.json()
        print(f"  [OK] Response status: {data.get('status')}")
        
        # Verify response fields
        assert data.get("status") == "success", f"Expected 'success', got {data.get('status')}"
        assert "slides_url" in data, "Missing 'slides_url' in response"
        assert "costo_total" in data, "Missing 'costo_total' in response"
        assert "precio_persona" in data, "Missing 'precio_persona' in response"
        
        print(f"  [OK] Slides URL: {data['slides_url']}")
        print(f"  [OK] Costo Total: USD {data['costo_total']:,.2f}")
        print(f"  [OK] Precio/Persona: USD {data['precio_persona']:,.2f}")
        
        # Verify financial calculations
        # Expected: gastos_admin = (2750 + 200) * 0.05 = 147.5
        # costo_total = (1500 + 150) + 2750 + 200 + 147.5 + 0 = 4747.5
        # precio_persona = 4747.5 / 2 = 2373.75
        expected_total = 4747.5
        expected_per_pax = 2373.75
        assert abs(data["costo_total"] - expected_total) < 0.01, \
            f"Financial calc error: expected total {expected_total}, got {data['costo_total']}"
        assert abs(data["precio_persona"] - expected_per_pax) < 0.01, \
            f"Financial calc error: expected per pax {expected_per_pax}, got {data['precio_persona']}"
        print(f"  [OK] Financial calculations verified correctly")
        
        return True
    except requests.exceptions.ConnectionError:
        print(f"  [FAIL] FAILED: Could not connect to {BASE_URL}. Is the server running?")
        return False
    except Exception as e:
        print(f"  [FAIL] FAILED: {e}")
        return False

def test_cotizar_multi_hotel():
    """Test POST /api/cotizar with multiple hotels"""
    print()
    print("=" * 60)
    print("TEST 3: POST /api/cotizar (Multiple Hotels)")
    print("=" * 60)
    multi_quote = quote.copy()
    multi_quote["nombre_pax"] = "Carlos Rodriguez"
    multi_quote["hoteles"] = [
        {
            "nombre": "Iberostar Selection",
            "descripcion": "Complejo all-inclusive frente al mar.",
            "estrellas": "★★★★★",
            "regimen": "All Inclusive",
            "habitacion": "Suite Estándar",
            "costo": 2750.0
        },
        {
            "nombre": "Barceló Bávaro Palace",
            "descripcion": "Resort de lujo con acceso directo a la playa.",
            "estrellas": "★★★★★",
            "regimen": "All Inclusive",
            "habitacion": "Habitación Superior",
            "costo": 3200.0
        }
    ]
    try:
        res = requests.post(f"{BASE_URL}/api/cotizar", json=multi_quote)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("status") == "success"
        assert "slides_url" in data, "Missing 'slides_url' in response"
        
        print(f"  [OK] Multi-hotel quote generated successfully")
        print(f"  [OK] Slides URL: {data['slides_url']}")
        print(f"  [OK] Costo Total (primary): USD {data['costo_total']:,.2f}")
        return True
    except requests.exceptions.ConnectionError:
        print(f"  [FAIL] FAILED: Could not connect to {BASE_URL}.")
        return False
    except Exception as e:
        print(f"  [FAIL] FAILED: {e}")
        return False

if __name__ == "__main__":
    print()
    print("=" * 60)
    print("  One Trip Giordano - API Integration Test Suite")
    print("=" * 60)
    print()
    
    results = []
    results.append(("GET /api/config", test_config()))
    results.append(("POST /api/cotizar (single hotel)", test_cotizar()))
    results.append(("POST /api/cotizar (multi hotel)", test_cotizar_multi_hotel()))
    
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    all_passed = True
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  {status}: {name}")
        if not passed:
            all_passed = False
    
    print()
    if all_passed:
        print(">> All tests passed! The application is working correctly.")
    else:
        print("Some tests failed. Review the output above.")
    
    sys.exit(0 if all_passed else 1)
