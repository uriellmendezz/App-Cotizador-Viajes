import os
import json
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TOKEN_FILE = os.path.join(BASE_DIR, "token.json")
CREDENTIALS_FILE = os.path.join(BASE_DIR, "credentials.json")

# Alcances necesarios para leer y escribir las presentaciones y manejar archivos en Drive
SCOPES = ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/presentations"]

def obtener_servicio_slides():
    creds = None
    # 1. Try user token from environment variable (GOOGLE_TOKEN or GOOGLE_TOKEN_JSON)
    google_token_json = os.environ.get("GOOGLE_TOKEN") or os.environ.get("GOOGLE_TOKEN_JSON")
    if google_token_json:
        try:
            token_info = json.loads(google_token_json)
            creds = Credentials.from_authorized_user_info(token_info, SCOPES)
        except Exception as e:
            print(f"Error loading user token from environment variable: {e}")

    # 2. Try service account info from environment variable (GOOGLE_CREDENTIALS or GOOGLE_CREDS_JSON)
    if not creds:
        google_creds_json = os.environ.get("GOOGLE_CREDENTIALS") or os.environ.get("GOOGLE_CREDS_JSON")
        if google_creds_json:
            try:
                creds_info = json.loads(google_creds_json)
                if creds_info.get("type") == "service_account":
                    from google.oauth2 import service_account
                    creds = service_account.Credentials.from_service_account_info(
                        creds_info, scopes=SCOPES
                    )
            except Exception as e:
                print(f"Error loading service account from environment variable: {e}")

    # 3. Fallback to local files
    if not creds and os.path.exists(TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        except Exception as e:
            print(f"Error loading local token.json: {e}")
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDENTIALS_FILE):
                raise FileNotFoundError(f"Missing credentials file: {CREDENTIALS_FILE}")
            flow = InstalledAppFlow.from_client_secrets_file(
                CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        
        # Save credentials back, but handle read-only filesystems gracefully
        try:
            with open(TOKEN_FILE, 'w') as token:
                token.write(creds.to_json())
        except Exception as e:
            print(f"Could not write token file (possibly read-only filesystem): {e}")

    return build('slides', 'v1', credentials=creds)

def exportar_estructura_completa(presentation_id, archivo_salida=None):
    if archivo_salida is None:
        archivo_salida = os.path.join(BASE_DIR, 'estructura_presentacion.json')
    else:
        if not os.path.isabs(archivo_salida):
            archivo_salida = os.path.join(BASE_DIR, archivo_salida)

    service = obtener_servicio_slides()

    try:
        print(f"Diciéndole a la API que devuelva toda la presentación: {presentation_id}...")
        
        # Esta llamada recupera TODA la presentación, incluyendo los elementos de cada página
        presentacion_json = service.presentations().get(
            presentationId=presentation_id
        ).execute()

        # Guardamos el JSON crudo en un archivo de texto formateado (indentado) y en UTF-8
        with open(archivo_salida, 'w', encoding='utf-8') as f:
            json.dump(presentacion_json, f, ensure_ascii=False, indent=4)
        
        print(f"¡Éxito! El JSON completo con todas las diapositivas se guardó en: {archivo_salida}")

    except Exception as e:
        print(f"Ocurrió un error al conectar con la API: {e}")

if __name__ == '__main__':
    # Reemplaza con el ID de tu plantilla de viajes
    ID_PLANTILLA = '1BKmuUUXgyLadjnJs26r8Bqut7gRdRkgs_oNMs2hBbzw'
    
    exportar_estructura_completa(ID_PLANTILLA)
