import os
from google_auth_oauthlib.flow import InstalledAppFlow

# Permisos para editar Slides y leer/copiar plantillas en Drive
SCOPES = [
    'https://www.googleapis.com/auth/presentations', 
    'https://www.googleapis.com/auth/drive'
]

# Setup base directory dynamic path resolution
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CREDENTIALS_FILE = os.path.join(BASE_DIR, "credentials.json")
TOKEN_FILE = os.path.join(BASE_DIR, "token.json")

def main():
    # Lee tu credentials.json de Google Cloud
    if not os.path.exists(CREDENTIALS_FILE):
        print(f"Error: No se encontró el archivo '{CREDENTIALS_FILE}' en la raíz del proyecto.")
        return

    flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
    
    # Abre el navegador y pide permisos forzando un Refresh Token (offline)
    creds = flow.run_local_server(port=0, prompt='consent', access_type='offline')
    
    # Guarda el nuevo token.json
    with open(TOKEN_FILE, 'w') as token:
        token.write(creds.to_json())
        
    print(f"¡Nuevo token.json generado con éxito en '{TOKEN_FILE}'!")

if __name__ == '__main__':
    main()
