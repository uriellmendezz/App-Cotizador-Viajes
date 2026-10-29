import os
import socket

import uvicorn
from app.main import app

HOST = "127.0.0.1"


def find_free_port(start_port, attempts=20):
    """Devuelve el primer puerto libre a partir de start_port (otra app puede estar usando el 8000)."""
    for port in range(start_port, start_port + attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((HOST, port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"No hay puertos libres entre {start_port} y {start_port + attempts - 1}.")


if __name__ == "__main__":
    # Start the FastAPI application located in app/main.py
    preferred_port = int(os.environ.get("PORT", 8000))
    port = find_free_port(preferred_port)
    if port != preferred_port:
        print(f"[Server] El puerto {preferred_port} está ocupado, se usa el {port}.")
    print(f"[Server] Abrí http://{HOST}:{port}")
    uvicorn.run("app.main:app", host=HOST, port=port, reload=True)
