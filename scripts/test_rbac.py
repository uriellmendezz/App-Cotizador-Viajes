# scripts/test_rbac.py
import os
import sys
from datetime import timedelta
import requests

# Add root folder to sys.path to allow imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from app.routers.auth import create_token
except ImportError as e:
    print(f"Error: No se pudo importar el generador de tokens. Detalles: {e}")
    sys.exit(1)

BASE_URL = "http://127.0.0.1:8000"

# Dummys UUIDs for testing
SUCURSAL_A = "11111111-1111-1111-1111-111111111111"
SUCURSAL_B = "22222222-2222-2222-2222-222222222222"

def print_test_result(name, success, info=""):
    status = "SUCCESS [OK]" if success else "FAILED [ERROR]"
    print(f"[{status}] {name} {f'({info})' if info else ''}")

def test_endpoint(name, path, token, expected_status, method="GET", payload=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    url = f"{BASE_URL}{path}"
    
    try:
        if method == "GET":
            res = requests.get(url, headers=headers, timeout=5)
        elif method == "POST":
            res = requests.post(url, headers=headers, json=payload, timeout=5)
        else:
            res = requests.delete(url, headers=headers, timeout=5)
            
        success = res.status_code == expected_status
        info = f"Expected: {expected_status}, Got: {res.status_code}"
        print_test_result(name, success, info)
        return success
    except Exception as e:
        print_test_result(name, False, f"Request failed: {e}")
        return False

def main():
    print("=== INICIANDO PRUEBAS DE SEGURIDAD RBAC Y MULTI-TENANCY ===")
    
    # 1. Generar Tokens
    print("\nGenerando tokens de prueba con JWT_SECRET_KEY...")
    
    # Token Admin Global
    admin_token = create_token(
        payload={
            "sub": "admin-test-id",
            "nombre": "Admin Test",
            "email": "admin@test.com",
            "rol": "ADMIN_GLOBAL",
            "sucursal_id": None,
            "type": "access"
        },
        expires_delta=timedelta(minutes=5)
    )
    
    # Token Agente Sucursal A
    agent_a_token = create_token(
        payload={
            "sub": "agent-a-test-id",
            "nombre": "Agente Córdoba",
            "email": "cba@test.com",
            "rol": "AGENTE_SUCURSAL",
            "sucursal_id": SUCURSAL_A,
            "type": "access"
        },
        expires_delta=timedelta(minutes=5)
    )
    
    # Token Agente Sucursal B
    agent_b_token = create_token(
        payload={
            "sub": "agent-b-test-id",
            "nombre": "Agente BsAs",
            "email": "bsas@test.com",
            "rol": "AGENTE_SUCURSAL",
            "sucursal_id": SUCURSAL_B,
            "type": "access"
        },
        expires_delta=timedelta(minutes=5)
    )

    # 2. Pruebas sin Token (Público)
    print("\n--- Pruebas de Acceso sin Autenticación ---")
    test_endpoint("Listar cotizaciones sin token", "/api/cotizaciones", None, 401)
    test_endpoint("Acceso a panel de admin sin token", "/api/admin/sucursales", None, 401)

    # 3. Pruebas de Rol AGENTE_SUCURSAL
    print("\n--- Pruebas de Rol AGENTE_SUCURSAL ---")
    test_endpoint(
        "Agente Sucursal A accede a cotizaciones (Debe filtrar en DB)",
        "/api/cotizaciones", 
        agent_a_token, 
        200
    )
    test_endpoint(
        "Agente Sucursal A intenta acceder a sucursales de admin (Bloqueado)",
        "/api/admin/sucursales", 
        agent_a_token, 
        403
    )
    test_endpoint(
        "Agente Sucursal A intenta acceder a agentes de admin (Bloqueado)",
        "/api/admin/agentes", 
        agent_a_token, 
        403
    )
    test_endpoint(
        "Agente Sucursal A intenta crear un agente (Bloqueado)",
        "/api/admin/agentes", 
        agent_a_token, 
        403,
        method="POST",
        payload={"nombre": "Intruso", "email": "intruso@test.com", "password": "password123"}
    )

    # 4. Pruebas de Rol ADMIN_GLOBAL
    print("\n--- Pruebas de Rol ADMIN_GLOBAL ---")
    test_endpoint(
        "Admin Global accede a cotizaciones",
        "/api/cotizaciones", 
        admin_token, 
        200
    )
    test_endpoint(
        "Admin Global accede a listar sucursales de admin",
        "/api/admin/sucursales", 
        admin_token, 
        200
    )
    test_endpoint(
        "Admin Global accede a listar agentes de admin",
        "/api/admin/agentes", 
        admin_token, 
        200
    )
    
    print("\n=== PRUEBAS FINALIZADAS ===")
    print("Nota: Asegúrate de ejecutar el script SQL 'scripts/001_rbac_multitenancy.sql' en Supabase para habilitar las columnas y políticas RLS.")

if __name__ == "__main__":
    main()
