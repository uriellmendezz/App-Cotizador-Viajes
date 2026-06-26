import os
import json
import base64
import tempfile
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from fastmcp import FastMCP
from dotenv import load_dotenv

load_dotenv()

# ── Dynamic Path Resolution ──────────────────────────────────────────────────
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CREDENTIALS_FILE = os.path.join(BASE_DIR, "config", "service_account.json")
TOKEN_FILE = os.path.join(BASE_DIR, "token.json")

SCOPES = ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/presentations"]

# Initialize FastMCP Server
mcp = FastMCP("GoogleSlides")

def get_google_credentials():
    """Load Google credentials, checking env variables first, then local files."""
    # 1. Try service account info from environment variable
    google_creds_json = os.environ.get("GOOGLE_CREDS_JSON")
    if google_creds_json:
        try:
            creds_info = json.loads(google_creds_json)
            return service_account.Credentials.from_service_account_info(
                creds_info, scopes=SCOPES
            )
        except Exception as e:
            print(f"Error loading service account from GOOGLE_CREDS_JSON: {e}")

    # 2. Try user token from environment variable
    google_token_json = os.environ.get("GOOGLE_TOKEN_JSON")
    if google_token_json:
        try:
            token_info = json.loads(google_token_json)
            return Credentials.from_authorized_user_info(token_info, SCOPES)
        except Exception as e:
            print(f"Error loading user token from GOOGLE_TOKEN_JSON: {e}")

    # 3. Fallback to local files
    if os.path.exists(CREDENTIALS_FILE):
        return service_account.Credentials.from_service_account_file(
            CREDENTIALS_FILE,
            scopes=SCOPES
        )
    elif os.path.exists(TOKEN_FILE):
        return Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    else:
        raise FileNotFoundError(
            f"Neither service account credentials at '{CREDENTIALS_FILE}', "
            f"nor user token at '{TOKEN_FILE}', nor environment variables GOOGLE_CREDS_JSON or GOOGLE_TOKEN_JSON were found."
        )

def upload_base64_image_to_drive(drive_service, base64_str, filename, folder_id=None):
    """
    Decodes a base64 image string, uploads it to Google Drive, 
    shares it publicly, and returns the direct download URL.
    """
    if not base64_str:
        return None
        
    try:
        # Extract base64 data if it is a data URI
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
            
        image_data = base64.b64decode(base64_str)
        
        # Write to a temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
        temp_file.write(image_data)
        temp_file.close()
        temp_path = temp_file.name
        
        # Upload metadata
        file_metadata = {'name': filename}
        if folder_id:
            file_metadata['parents'] = [folder_id]
            
        media = MediaFileUpload(temp_path, mimetype='image/png', resumable=True)
        uploaded_file = drive_service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        ).execute()
        
        file_id = uploaded_file.get('id')
        
        # Share file: anyone can read
        permission = {
            'type': 'anyone',
            'role': 'reader'
        }
        drive_service.permissions().create(
            fileId=file_id,
            body=permission
        ).execute()
        
        # Clean up local temporary file
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
        # Return direct download URL
        return f"https://lh3.googleusercontent.com/d/{file_id}"
    except Exception as e:
        print(f"Error uploading image '{filename}' to Google Drive: {e}")
        return None

def get_stars_count(stars_val):
    if not stars_val:
        return 5
    if isinstance(stars_val, int):
        return min(max(stars_val, 1), 5)
    stars_str = str(stars_val).strip()
    if '★' in stars_str:
        return min(max(stars_str.count('★'), 1), 5)
    try:
        return min(max(int(float(stars_str)), 1), 5)
    except ValueError:
        return 5

def set_shape_text(requests, object_id, text, font_size=10, bold=False, color_rgb=(0.2, 0.2, 0.2), alignment="START", weight=400):
    requests.append({
        "deleteText": {
            "objectId": object_id,
            "textRange": {"type": "ALL"}
        }
    })
    requests.append({
        "insertText": {
            "objectId": object_id,
            "text": text,
            "insertionIndex": 0
        }
    })
    requests.append({
        "updateTextStyle": {
            "objectId": object_id,
            "style": {
                "fontFamily": "Montserrat",
                "fontSize": {"magnitude": font_size, "unit": "PT"},
                "bold": bold,
                "weightedFontFamily": {
                    "fontFamily": "Montserrat",
                    "weight": weight
                },
                "foregroundColor": {
                    "opaqueColor": {
                        "rgbColor": {
                            "red": color_rgb[0],
                            "green": color_rgb[1],
                            "blue": color_rgb[2]
                        }
                    }
                }
            },
            "fields": "fontFamily,fontSize,bold,foregroundColor,weightedFontFamily"
        }
    })
    requests.append({
        "updateParagraphStyle": {
            "objectId": object_id,
            "style": {
                "alignment": alignment
            },
            "fields": "alignment"
        }
    })

def set_hotel_name_and_stars(requests, name_id, hotel_nombre, stars_count, is_recomendacion=False):
    full_text = f"{hotel_nombre}  ★★★★★"
    requests.append({
        "deleteText": {
            "objectId": name_id,
            "textRange": {"type": "ALL"}
        }
    })
    requests.append({
        "insertText": {
            "objectId": name_id,
            "text": full_text,
            "insertionIndex": 0
        }
    })
    requests.append({
        "updateTextStyle": {
            "objectId": name_id,
            "textRange": {
                "type": "ALL"
            },
            "style": {
                "fontFamily": "Montserrat"
            },
            "fields": "fontFamily"
        }
    })
    # Hotel Name Style: Montserrat Bold (700), size 14 pt
    requests.append({
        "updateTextStyle": {
            "objectId": name_id,
            "textRange": {
                "type": "FIXED_RANGE",
                "startIndex": 0,
                "endIndex": len(hotel_nombre)
            },
            "style": {
                "fontSize": {"magnitude": 14, "unit": "PT"},
                "bold": True,
                "weightedFontFamily": {
                    "fontFamily": "Montserrat",
                    "weight": 700
                },
                "foregroundColor": {
                    "opaqueColor": {
                        "rgbColor": {"red": 0.2039, "green": 0.2039, "blue": 0.2039}
                    }
                }
            },
            "fields": "fontSize,bold,weightedFontFamily,foregroundColor"
        }
    })
    
    # Active Stars Style: Montserrat Medium (500), size 14 pt
    requests.append({
        "updateTextStyle": {
            "objectId": name_id,
            "textRange": {
                "type": "FIXED_RANGE",
                "startIndex": len(hotel_nombre) + 2,
                "endIndex": len(hotel_nombre) + 2 + stars_count
            },
            "style": {
                "fontSize": {"magnitude": 14, "unit": "PT"},
                "bold": False,
                "weightedFontFamily": {
                    "fontFamily": "Montserrat",
                    "weight": 500
                },
                "foregroundColor": {
                    "opaqueColor": {
                        "rgbColor": {"red": 0.9686, "green": 0.7412, "blue": 0.2745}
                    }
                }
            },
            "fields": "fontSize,bold,weightedFontFamily,foregroundColor"
        }
    })
    
    # Inactive Stars Style: Montserrat Medium (500), size 14 pt
    requests.append({
        "updateTextStyle": {
            "objectId": name_id,
            "textRange": {
                "type": "FIXED_RANGE",
                "startIndex": len(hotel_nombre) + 2 + stars_count,
                "endIndex": len(hotel_nombre) + 7
            },
            "style": {
                "fontSize": {"magnitude": 14, "unit": "PT"},
                "bold": False,
                "weightedFontFamily": {
                    "fontFamily": "Montserrat",
                    "weight": 500
                },
                "foregroundColor": {
                    "opaqueColor": {
                        "rgbColor": {"red": 0.8078, "green": 0.8078, "blue": 0.8078}
                    }
                }
            },
            "fields": "fontSize,bold,weightedFontFamily,foregroundColor"
        }
    })

def create_presentation_from_template(template_id: str, folder_id: str, quote_data: dict) -> str:
    """
    Copies a Google Slides template, uploads any images to Drive,
    replaces all text placeholders, adds flight/hotel images dynamically,
    and returns the presentation's edit URL. Supports v1 and v2 templates.
    """
    if not template_id:
        print("Google Slides: Template ID is empty. Skipping presentation generation.")
        return None
        
    from datetime import datetime
    from app.google_slides.generator import upload_image_to_drive

    creds = get_google_credentials()
    drive_service = build("drive", "v3", credentials=creds)
    slides_service = build("slides", "v1", credentials=creds)
    
    # 1. Copy the template presentation
    passenger_name = quote_data.get("nombre_pax", "Pasajero")
    destination = quote_data.get("destino", "Destino")
    today_fn = datetime.now().strftime("%d-%m-%Y_%H-%M-%S")
    copy_title = f"Cotización - {passenger_name} - {destination} - {today_fn}"
    
    body = {'name': copy_title}
    if folder_id:
        body['parents'] = [folder_id]
        
    print(f"Google Slides: Copying template '{template_id}'...")
    copied_file = drive_service.files().copy(
        fileId=template_id,
        body=body,
        fields='id'
    ).execute()
    presentation_id = copied_file.get('id')
    print(f"Google Slides: Presentation copied. ID: {presentation_id}")
    
    # 2. Make it editable by anyone with the link
    permission = {
        'type': 'anyone',
        'role': 'writer'
    }
    drive_service.permissions().create(
        fileId=presentation_id,
        body=permission
    ).execute()
    
    # 3. Retrieve slide ID and presentation metadata
    pres_data = slides_service.presentations().get(presentationId=presentation_id).execute()
    slides_list = pres_data.get("slides", [])
    slide_id = slides_list[0]["objectId"]
    
    # Detect template version by checking object ID prefixes
    is_v2 = False
    for el in pres_data["slides"][0].get("pageElements", []):
        if "g3f1aacc1efc" in el.get("objectId", ""):
            is_v2 = True
            break
    print(f"Google Slides: Detected template version: {'v2' if is_v2 else 'v1'}")
    
    # Traverse elements to compute absolute transforms
    absolute_elements = []
    
    def get_absolute_transform(transform, parent_transform=None):
        tx = transform.get("translateX", 0)
        ty = transform.get("translateY", 0)
        sx = transform.get("scaleX", 1.0)
        sy = transform.get("scaleY", 1.0)
        
        if parent_transform:
            p_tx = parent_transform.get("translateX", 0)
            p_ty = parent_transform.get("translateY", 0)
            p_sx = parent_transform.get("scaleX", 1.0)
            p_sy = parent_transform.get("scaleY", 1.0)
            
            tx = p_tx + p_sx * tx
            ty = p_ty + p_sy * ty
            sx = p_sx * sx
            sy = p_sy * sy
            
        return {
            "translateX": tx,
            "translateY": ty,
            "scaleX": sx,
            "scaleY": sy
        }
        
    def traverse(e, parent_transform=None):
        transform = e.get("transform", {})
        abs_transform = get_absolute_transform(transform, parent_transform)
        
        if "elementGroup" in e:
            for child in e["elementGroup"]["children"]:
                traverse(child, abs_transform)
        else:
            size = e.get("size", {})
            w = size.get("width", {}).get("magnitude", 0)
            h = size.get("height", {}).get("magnitude", 0)
            
            abs_w = w * abs_transform["scaleX"]
            abs_h = h * abs_transform["scaleY"]
            
            el_info = {
                "objectId": e["objectId"],
                "abs_tx": abs_transform["translateX"],
                "abs_ty": abs_transform["translateY"],
                "abs_w": abs_w,
                "abs_h": abs_h
            }
            absolute_elements.append(el_info)
            
    for e in pres_data["slides"][0].get("pageElements", []):
        traverse(e)
        
    # Map placeholders
    hotel_image_placeholders = {}
    for el in absolute_elements:
        oid = el["objectId"]
        if oid == "g3f1aacc1efc_0_357":
            hotel_image_placeholders[1] = el
        elif oid == "g3f1aacc1efc_0_374":
            hotel_image_placeholders[2] = el
        elif oid == "g3f1aacc1efc_0_389":
            hotel_image_placeholders[3] = el

    
    # 4. Initialize batchUpdate requests list
    requests = []
    
    # Delete any extra slides if the template has more than 1 slide
    if len(slides_list) > 1:
        for extra_slide in slides_list[1:]:
            requests.append({"deleteObject": {"objectId": extra_slide["objectId"]}})
    
    # Deleting empty hotel options
    hotels = quote_data.get("hoteles", [])
    if is_v2:
        if len(hotels) < 3:
            print("[Slides] Removing empty Hotel 3 group...")
            requests.append({"deleteObject": {"objectId": "g3f1aacc1efc_0_400"}})
        if len(hotels) < 2:
            print("[Slides] Removing empty Hotel 2 group...")
            requests.append({"deleteObject": {"objectId": "g3f1aacc1efc_0_385"}})
    else:
        if len(hotels) < 3:
            print("[Slides] Removing empty Hotel 3 elements...")
            for oid in ["g3ed293438f8_0_223", "g3ed293438f8_0_233", "g3ed293438f8_0_234", "g3ed293438f8_0_235", "g3ed29c09831_0_3", "g3ed29c09831_0_4"]:
                requests.append({"deleteObject": {"objectId": oid}})
        if len(hotels) < 2:
            print("[Slides] Removing empty Hotel 2 elements...")
            for oid in ["g3ed293438f8_0_209", "g3ed293438f8_0_219", "g3ed293438f8_0_220", "g3ed293438f8_0_221", "g3ed29c09831_0_1", 
                        "g3ed293438f8_0_210", "g3ed293438f8_0_211", "g3ed293438f8_0_212", "g3ed293438f8_0_213", "g3ed293438f8_0_214", "g3ed293438f8_0_215"]:
                requests.append({"deleteObject": {"objectId": oid}})
    
    # 5. Map text replacements
    replacements = {}
    
    # Financial calculations
    cant_pax = int(quote_data.get("cantidad_pasajeros", 1))
    monto_vuelos = float(quote_data.get("monto_vuelos", 0.0))
    fee_aereo = float(quote_data.get("fee_aereo", 0.0))
    monto_traslados = float(quote_data.get("monto_traslados", 0.0))
    costo_total = float(quote_data.get("costo_total", 0.0))
    precio_persona = float(quote_data.get("precio_persona", 0.0))
    
    # Formatting values
    def fmt_curr(val):
        try:
            return f"USD ${float(val):,.2f}".replace(",", ".")
        except (ValueError, TypeError):
            return "USD $0.00"
            
    today_str = datetime.now().strftime("%d/%m/%Y")
    
    # Main fields
    replacements["<<PASAJERO>>"] = passenger_name
    replacements["<<DESTINO>>"] = destination
    replacements["<<CANTIDAD_PASAJEROS>>"] = str(cant_pax)
    replacements["<<CANTIDAD PASAJEROS>>"] = str(cant_pax)
    replacements["<<FECHA_SALIDA>>"] = quote_data.get("fecha_salida", "")
    replacements["<<FECHA SALIDA>>"] = quote_data.get("fecha_salida", "")
    replacements["<<ORIGEN>>"] = quote_data.get("origen", "")
    replacements["<<SALIDA DESDE>>"] = quote_data.get("origen", "")
    replacements["<<AGENTE_NOMBRE>>"] = quote_data.get("agente_nombre", "Uriel")
    replacements["<<NOMBRE DEL AGENTE>>"] = quote_data.get("agente_nombre", "Uriel")
    
    replacements["<<FECHA_VUELO_IDA>>"] = quote_data.get("fecha_vuelo_ida", "")
    replacements["<<FECHA VUELO IDA>>"] = quote_data.get("fecha_vuelo_ida", "")
    replacements["<<FECHA_VUELO_VUELTA>>"] = quote_data.get("fecha_vuelo_vuelta", "")
    replacements["<<FECHA VUELO VUELTA>>"] = quote_data.get("fecha_vuelo_vuelta", "")
    
    replacements["<<IDA>>"] = quote_data.get("fecha_vuelo_ida", "")
    replacements["<<VUELTA>>"] = quote_data.get("fecha_vuelo_vuelta", "")
    
    replacements["<<MONTO_VUELOS>>"] = fmt_curr(monto_vuelos)
    replacements["<<TOTAL AEREO>>"] = fmt_curr(monto_vuelos)
    replacements["<<FEE_AEREO>>"] = fmt_curr(fee_aereo)
    replacements["<<FEE AEREO>>"] = fmt_curr(fee_aereo)
    replacements["<<MONTO_TRASLADOS>>"] = fmt_curr(monto_traslados)
    replacements["<<TRASLADOS>>"] = fmt_curr(monto_traslados)
    
    replacements["<<COSTO_TOTAL>>"] = fmt_curr(costo_total)
    replacements["<<TOTAL VIAJE>>"] = fmt_curr(costo_total)
    replacements["<<PRECIO_PERSONA>>"] = fmt_curr(precio_persona)
    replacements["<<BASE_HABITACION>>"] = quote_data.get("base_habitacion", "")
    replacements["<<NOCHES_ALOJAMIENTO>>"] = quote_data.get("noches_alojamiento", "7 noches")
    replacements["<<NOCHES ALOJAMIENTO>>"] = quote_data.get("noches_alojamiento", "7 noches")
    replacements["<<NOCHES>>"] = quote_data.get("noches_alojamiento", "7 noches")
    
    replacements["<<TITULO_VIAJE>>"] = destination.upper()
    replacements["<<TITULO VIAJE>>"] = destination.upper()
    
    replacements["<<PROPUESTA>>"] = f"Propuesta para {passenger_name} con salida el {quote_data.get('fecha_salida')}."
    replacements["<<PROPUESTA PARA>>"] = f"Propuesta para {passenger_name} con salida el {quote_data.get('fecha_salida')}."
    replacements["<<DETALLE_AEREO>>"] = f"{quote_data.get('noches_alojamiento', '7 noches')} en {destination} para {cant_pax} pasajeros"
    replacements["<<DETALLE AEREO>>"] = f"{quote_data.get('noches_alojamiento', '7 noches')} en {destination} para {cant_pax} pasajeros"
    replacements["<<DETALLE_HOTEL>>"] = f"Estadía en {destination} por {quote_data.get('noches_alojamiento', '7 noches')}."
    replacements["<<DETALLE HOTEL>>"] = f"Estadía en {destination} por {quote_data.get('noches_alojamiento', '7 noches')}."
    replacements["<<DETALLE ALOJAMIENTO>>"] = quote_data.get("detalle_hotel", f"Estadía en {destination} por {quote_data.get('noches_alojamiento', '7 noches')}.")
    replacements["<<FECHA COTIZACION>>"] = today_str
    
    # Hotel options mapping
    for i in range(4):
        h_num = i + 1
        if i < len(hotels):
            h = hotels[i]
            replacements[f"<<HOTEL_{h_num}_NOMBRE>>"] = h.get("nombre", "")
            replacements[f"<<HOTEL {h_num} NOMBRE>>"] = h.get("nombre", "")
            replacements[f"<<HOTEL {h_num}>>"] = h.get("nombre", "")
            replacements[f"<<HOTEL_{h_num}>>"] = h.get("nombre", "")
            
            replacements[f"<<HOTEL_{h_num}_DESCRIPCION>>"] = h.get("descripcion", "")
            replacements[f"<<HOTEL {h_num} DESCRIPCION>>"] = h.get("descripcion", "")
            replacements[f"<<DESCRIPCION HOTEL {h_num}>>"] = h.get("descripcion", "")
            replacements[f"<<DESCRIPCION HOTEL_{h_num}>>"] = h.get("descripcion", "")
            
            replacements[f"<<HOTEL_{h_num}_ESTRELLAS>>"] = h.get("estrellas", "")
            replacements[f"<<HOTEL {h_num} ESTRELLAS>>"] = h.get("estrellas", "")
            replacements[f"<<ESTRELLAS HOTEL {h_num}>>"] = h.get("estrellas", "")
            replacements[f"<<ESTRELLAS HOTEL_{h_num}>>"] = h.get("estrellas", "")
            
            replacements[f"<<HOTEL_{h_num}_REGIMEN>>"] = h.get("regimen", "")
            replacements[f"<<HOTEL {h_num} REGIMEN>>"] = h.get("regimen", "")
            replacements[f"<<REGIMEN {h_num}>>"] = h.get("regimen", "")
            replacements[f"<<REGIMEN_{h_num}>>"] = h.get("regimen", "")
            
            replacements[f"<<HOTEL_{h_num}_HABITACION>>"] = h.get("habitacion", "")
            replacements[f"<<HOTEL {h_num} HABITACION>>"] = h.get("habitacion", "")
            replacements[f"<<DORMITORIOS {h_num}>>"] = h.get("habitacion", "")
            replacements[f"<<DORMITORIOS_{h_num}>>"] = h.get("habitacion", "")
            
            replacements[f"<<HOTEL_{h_num}_COSTO>>"] = fmt_curr(h.get("costo", 0.0))
            replacements[f"<<HOTEL {h_num} COSTO>>"] = fmt_curr(h.get("costo", 0.0))
            replacements[f"<<TOTAL HOTEL {h_num}>>"] = fmt_curr(h.get("costo", 0.0))
            replacements[f"<<TOTAL HOTEL_{h_num}>>"] = fmt_curr(h.get("costo", 0.0))
            
            replacements[f"<<HOTEL_{h_num}_PRECIO_PERSONA>>"] = fmt_curr(h.get("precio_persona", 0.0))
            replacements[f"<<HOTEL {h_num} PRECIO PERSONA>>"] = fmt_curr(h.get("precio_persona", 0.0))
        else:
            replacements[f"<<HOTEL_{h_num}_NOMBRE>>"] = ""
            replacements[f"<<HOTEL {h_num} NOMBRE>>"] = ""
            replacements[f"<<HOTEL {h_num}>>"] = ""
            replacements[f"<<HOTEL_{h_num}>>"] = ""
            replacements[f"<<HOTEL_{h_num}_DESCRIPCION>>"] = ""
            replacements[f"<<HOTEL {h_num} DESCRIPCION>>"] = ""
            replacements[f"<<DESCRIPCION HOTEL {h_num}>>"] = ""
            replacements[f"<<DESCRIPCION HOTEL_{h_num}>>"] = ""
            replacements[f"<<HOTEL_{h_num}_ESTRELLAS>>"] = ""
            replacements[f"<<HOTEL {h_num} ESTRELLAS>>"] = ""
            replacements[f"<<ESTRELLAS HOTEL {h_num}>>"] = ""
            replacements[f"<<ESTRELLAS HOTEL_{h_num}>>"] = ""
            replacements[f"<<HOTEL_{h_num}_REGIMEN>>"] = ""
            replacements[f"<<HOTEL {h_num} REGIMEN>>"] = ""
            replacements[f"<<REGIMEN {h_num}>>"] = ""
            replacements[f"<<REGIMEN_{h_num}>>"] = ""
            replacements[f"<<HOTEL_{h_num}_HABITACION>>"] = ""
            replacements[f"<<HOTEL {h_num} HABITACION>>"] = ""
            replacements[f"<<DORMITORIOS {h_num}>>"] = ""
            replacements[f"<<DORMITORIOS_{h_num}>>"] = ""
            replacements[f"<<HOTEL_{h_num}_COSTO>>"] = ""
            replacements[f"<<HOTEL {h_num} COSTO>>"] = ""
            replacements[f"<<TOTAL HOTEL {h_num}>>"] = ""
            replacements[f"<<TOTAL HOTEL_{h_num}>>"] = ""
            replacements[f"<<HOTEL_{h_num}_PRECIO_PERSONA>>"] = ""
            replacements[f"<<HOTEL {h_num} PRECIO PERSONA>>"] = ""
            
    # Text replacements requests
    for tag, value in replacements.items():
        requests.append({
            'replaceAllText': {
                'containsText': {
                    'text': tag,
                    'matchCase': False
                },
                'replaceText': str(value)
            }
        })
        
    # 6. Upload flight images
    vuelo_ida_base64 = quote_data.get("img_vuelo_ida")
    vuelo_vuelta_base64 = quote_data.get("img_vuelo_vuelta")
    
    ida_placeholder_id = "g3f1aacc1efc_0_351" if is_v2 else "g3ed293438f8_0_154"
    vuelta_placeholder_id = "g3f1aacc1efc_0_352" if is_v2 else "g3ed293438f8_0_155"
    
    # Handle Flight Ida
    if vuelo_ida_base64:
        url_ida = upload_image_to_drive(drive_service, vuelo_ida_base64, f"vuelo_ida_{passenger_name}.png", folder_id)
        if url_ida:
            requests.append({
                "replaceImage": {
                    "imageObjectId": ida_placeholder_id,
                    "url": url_ida,
                    "imageReplaceMethod": "CENTER_INSIDE"
                }
            })
    else:
        requests.append({"deleteObject": {"objectId": ida_placeholder_id}})
        
    # Handle Flight Vuelta
    if vuelo_vuelta_base64:
        url_vuelta = upload_image_to_drive(drive_service, vuelo_vuelta_base64, f"vuelo_vuelta_{passenger_name}.png", folder_id)
        if url_vuelta:
            requests.append({
                "replaceImage": {
                    "imageObjectId": vuelta_placeholder_id,
                    "url": url_vuelta,
                    "imageReplaceMethod": "CENTER_INSIDE"
                }
            })
    else:
        requests.append({"deleteObject": {"objectId": vuelta_placeholder_id}})

    # 7. Upload hotel images and dynamically set options
    active_hotels_count = min(len(hotels), 3)
    
    if is_v2:
        # v2 layout engine
        for idx in range(active_hotels_count):
            h = hotels[idx]
            h_num = idx + 1
            h_name = h.get("nombre", f"Hotel_{h_num}").replace(" ", "_")
            
            # Map object IDs for v2
            name_id = "g3f1aacc1efc_0_356" if h_num == 1 else ("g3f1aacc1efc_0_373" if h_num == 2 else "g3f1aacc1efc_0_388")
            desc_id = "g3f1aacc1efc_0_355" if h_num == 1 else ("g3f1aacc1efc_0_372" if h_num == 2 else "g3f1aacc1efc_0_387")
            stars_id = "g3f1aacc1efc_0_364" if h_num == 1 else ("g3f1aacc1efc_0_381" if h_num == 2 else "g3f1aacc1efc_0_396")
            img_placeholder_id = "g3f1aacc1efc_0_357" if h_num == 1 else ("g3f1aacc1efc_0_374" if h_num == 2 else "g3f1aacc1efc_0_389")
            
            nights_id = "g3f1aacc1efc_0_361" if h_num == 1 else ("g3f1aacc1efc_0_378" if h_num == 2 else "g3f1aacc1efc_0_393")
            room_id = "g3f1aacc1efc_0_363" if h_num == 1 else ("g3f1aacc1efc_0_380" if h_num == 2 else "g3f1aacc1efc_0_395")
            board_id = "g3f1aacc1efc_0_362" if h_num == 1 else ("g3f1aacc1efc_0_379" if h_num == 2 else "g3f1aacc1efc_0_394")
            
            ppp_id = "g3f1aacc1efc_0_366" if h_num == 1 else ("g3f1aacc1efc_0_383" if h_num == 2 else "g3f1aacc1efc_0_398")
            total_id = "g3f1aacc1efc_0_367" if h_num == 1 else ("g3f1aacc1efc_0_384" if h_num == 2 else "g3f1aacc1efc_0_399")
            
            # 7a. Set Hotel Name with Stars
            stars_count = get_stars_count(h.get("estrellas"))
            set_hotel_name_and_stars(requests, name_id, h.get("nombre", ""), stars_count, is_recomendacion=(h_num == 1))
            # Delete/Empty the original template's stars text box
            requests.append({
                "deleteText": {
                    "objectId": stars_id,
                    "textRange": {"type": "ALL"}
                }
            })
            
            # 7b. Set remaining hotel texts explicitly by ID to override template values
            base_hab_str = quote_data.get("base_habitacion", "Doble")
            noches_str = quote_data.get("noches_alojamiento", "7 noches")
            set_shape_text(requests, desc_id, h.get("descripcion", ""), font_size=7, alignment="JUSTIFIED")
            set_shape_text(requests, nights_id, h.get("noches", noches_str), font_size=8, bold=True)
            set_shape_text(requests, room_id, h.get("habitacion", "1 dormitorio"), font_size=8, bold=True)
            set_shape_text(requests, board_id, h.get("regimen", "All Inclusive"), font_size=8, bold=True)
            ppp_font_size = 14 if h_num == 1 else 11
            total_font_size = 8.5 if h_num == 1 else 7.5
            set_shape_text(requests, ppp_id, fmt_curr(h.get("precio_persona", 0.0)), font_size=ppp_font_size, bold=True, alignment="CENTER")
            set_shape_text(requests, total_id, f"por persona en Base {base_hab_str}. {fmt_curr(h.get('costo', 0.0))} en total.", font_size=total_font_size, bold=True, alignment="CENTER")
            
            # Make the price and total text boxes wider to prevent wrapping
            for box_id in [ppp_id, total_id]:
                requests.append({
                    "updatePageElementTransform": {
                        "objectId": box_id,
                        "transform": {
                            "scaleX": 1.35,
                            "scaleY": 1.0,
                            "unit": "EMU"
                        },
                        "applyMode": "RELATIVE"
                    }
                })
                
            # Get the card base position from the hotel image placeholder
            placeholder = hotel_image_placeholders.get(h_num)
            if placeholder:
                card_base_tx = placeholder["abs_tx"]
                card_base_ty = placeholder["abs_ty"]
                card_base_w = placeholder["abs_w"]
                card_base_h = placeholder["abs_h"]
            else:
                card_base_tx = 441609
                card_base_ty = 5323334 + idx * 1671644
                card_base_w = 1770126
                card_base_h = 1186125

            # Align and space (justify-content: space-between) Nights, Room, and Board elements
            # Resolve metadata IDs
            nights_icon_id = "g3f1aacc1efc_0_360" if h_num == 1 else ("g3f1aacc1efc_0_377" if h_num == 2 else "g3f1aacc1efc_0_392")
            nights_id = "g3f1aacc1efc_0_361" if h_num == 1 else ("g3f1aacc1efc_0_378" if h_num == 2 else "g3f1aacc1efc_0_393")
            
            room_icon_id = "g3f1aacc1efc_0_359" if h_num == 1 else ("g3f1aacc1efc_0_376" if h_num == 2 else "g3f1aacc1efc_0_391")
            room_id = "g3f1aacc1efc_0_363" if h_num == 1 else ("g3f1aacc1efc_0_380" if h_num == 2 else "g3f1aacc1efc_0_395")
            
            board_icon_id = "g3f1aacc1efc_0_358" if h_num == 1 else ("g3f1aacc1efc_0_375" if h_num == 2 else "g3f1aacc1efc_0_390")
            board_id = "g3f1aacc1efc_0_362" if h_num == 1 else ("g3f1aacc1efc_0_379" if h_num == 2 else "g3f1aacc1efc_0_394")
            
            el_map = {}
            for el in absolute_elements:
                if el["objectId"] in [nights_id, board_id, room_id, nights_icon_id, board_icon_id, room_icon_id]:
                    el_map[el["objectId"]] = el
            
            if len(el_map) == 6:
                # Target Y from template nights text box Y
                target_y = el_map[nights_id]["abs_ty"]
                
                w_icon1, w_text1 = el_map[nights_icon_id]["abs_w"], el_map[nights_id]["abs_w"]
                w_icon2, w_text2 = el_map[board_icon_id]["abs_w"], el_map[board_id]["abs_w"]
                w_icon3, w_text3 = el_map[room_icon_id]["abs_w"], el_map[room_id]["abs_w"]
                
                gap = 35000  # subtle gap between icon and text
                
                # Group widths
                gw1 = w_icon1 + gap + w_text1
                gw2 = w_icon2 + gap + w_text2
                gw3 = w_icon3 + gap + w_text3
                
                # Available card width and start position
                W = card_base_w
                X0 = card_base_tx
                
                # Space between groups
                space = (W - (gw1 + gw2 + gw3)) / 2.0
                
                pos_map = {}
                # Nights Group
                pos_map[nights_icon_id] = X0
                pos_map[nights_id] = X0 + w_icon1 + gap
                
                # Board Group
                x2_start = X0 + gw1 + space
                pos_map[board_icon_id] = x2_start
                pos_map[board_id] = x2_start + w_icon2 + gap
                
                # Room Group
                x3_start = X0 + W - gw3
                pos_map[room_icon_id] = x3_start
                pos_map[room_id] = x3_start + w_icon3 + gap
                
                # Generate translation requests to perfectly center vertically and space horizontally
                for o_id, target_x in pos_map.items():
                    el = el_map[o_id]
                    dX = target_x - el["abs_tx"]
                    dY = target_y - el["abs_ty"]
                    
                    requests.append({
                        "updatePageElementTransform": {
                            "objectId": o_id,
                            "transform": {
                                "scaleX": 1.0,
                                "scaleY": 1.0,
                                "translateX": dX,
                                "translateY": dY,
                                "unit": "EMU"
                            },
                            "applyMode": "RELATIVE"
                        }
                    })
            
            # 7c. Set checklist text dynamically
            if h_num == 1:
                set_shape_text(requests, "g3f1aacc1efc_0_451", f"Vuelos desde {quote_data.get('origen', '')} hacia {destination} para {cant_pax} pasajeros.", font_size=9)
                set_shape_text(requests, "g3f1aacc1efc_0_445", f"Estadía en {destination} por {noches_str}.", font_size=9)
                set_shape_text(requests, "g3f1aacc1efc_0_448", quote_data.get("detalle_traslado", "Traslados de llegada y regreso (Aeropuerto/Hotel/Aeropuerto)"), font_size=9)
                set_shape_text(requests, "g3f1aacc1efc_0_339", destination.upper(), font_size=40, bold=True, alignment="CENTER", weight=900)
                set_shape_text(requests, "g3f1aacc1efc_0_340", f"Propuesta para {passenger_name} con salida el {quote_data.get('fecha_salida')}.", font_size=11, bold=True, alignment="CENTER")
                set_shape_text(requests, "g3f1aacc1efc_0_334", quote_data.get("fecha_vuelo_ida", ""), font_size=7, bold=True)
                set_shape_text(requests, "g3f1aacc1efc_0_336", quote_data.get("fecha_vuelo_vuelta", ""), font_size=7, bold=True)
                set_shape_text(requests, "g3f1aacc1efc_0_370", today_str, font_size=7)

            # 7d. Set Hotel Image and Gallery
            requests.append({"deleteObject": {"objectId": img_placeholder_id}})
            
            h_images = []
            for key in ["imagen", "imagen1", "imagen2", "imagen3"]:
                val = h.get(key)
                if val and val not in h_images:
                    h_images.append(val)
            if "imagenes" in h and isinstance(h["imagenes"], list):
                for img in h["imagenes"]:
                    if img and img not in h_images:
                        h_images.append(img)
            h_images = [img for img in h_images if img]
            
            placeholder = hotel_image_placeholders.get(h_num)
            if placeholder:
                card_base_tx = placeholder["abs_tx"]
                card_base_ty = placeholder["abs_ty"]
                card_base_w = placeholder["abs_w"]
                card_base_h = placeholder["abs_h"]
            else:
                card_base_tx = 441609
                card_base_ty = 5323334 + idx * 1671644
                card_base_w = 1770126
                card_base_h = 1186125
            
            if h_images:
                url_main = upload_image_to_drive(drive_service, h_images[0], f"hotel_{h_num}_img_main.png", folder_id)
                if url_main:
                    if len(h_images) == 1:
                        # Full size main image
                        requests.append({
                            "createImage": {
                                "url": url_main,
                                "elementProperties": {
                                    "pageObjectId": slide_id,
                                    "size": {
                                        "width": {"magnitude": card_base_w, "unit": "EMU"},
                                        "height": {"magnitude": card_base_h, "unit": "EMU"},
                                    },
                                    "transform": {
                                        "scaleX": 1.0, "scaleY": 1.0,
                                        "translateX": card_base_tx, "translateY": card_base_ty,
                                        "unit": "EMU",
                                    },
                                },
                            }
                        })
                    else:
                        # Reduced size main image
                        main_h = card_base_h * 0.7
                        requests.append({
                            "createImage": {
                                "url": url_main,
                                "elementProperties": {
                                    "pageObjectId": slide_id,
                                    "size": {
                                        "width": {"magnitude": card_base_w, "unit": "EMU"},
                                        "height": {"magnitude": main_h, "unit": "EMU"},
                                    },
                                    "transform": {
                                        "scaleX": 1.0, "scaleY": 1.0,
                                        "translateX": card_base_tx, "translateY": card_base_ty,
                                        "unit": "EMU",
                                    },
                                },
                            }
                        })
                        
                        # Gallery images
                        gallery_images = h_images[1:3]
                        gap = 60000  # subtle gap between gallery photos (approx 1.6mm)
                        small_w = (card_base_w - gap) / 2
                        small_h = card_base_h * 0.25
                        small_ty = card_base_ty + card_base_h * 0.75
                        
                        for g_idx, g_img in enumerate(gallery_images):
                            url_small = upload_image_to_drive(drive_service, g_img, f"hotel_{h_num}_img_gal_{g_idx}.png", folder_id)
                            if url_small:
                                small_tx = card_base_tx + g_idx * (small_w + gap)
                                requests.append({
                                    "createImage": {
                                        "url": url_small,
                                        "elementProperties": {
                                            "pageObjectId": slide_id,
                                            "size": {
                                                "width": {"magnitude": small_w, "unit": "EMU"},
                                                "height": {"magnitude": small_h, "unit": "EMU"},
                                            },
                                            "transform": {
                                                "scaleX": 1.0, "scaleY": 1.0,
                                                "translateX": small_tx, "translateY": small_ty,
                                                "unit": "EMU",
                                            },
                                        },
                                    }
                                })
                                
    else:
        # Fallback to original v1 layout engine
        for idx, h in enumerate(hotels[:active_hotels_count]):
            h_num = idx + 1
            h_name = h.get("nombre", f"Hotel_{h_num}").replace(" ", "_")
            
            noches_str = quote_data.get("noches_alojamiento", "7 noches")
            dorm_str = h.get("habitacion", "1 dormitorio")
            reg_str = h.get("regimen", "All Inclusive")
            
            if h_num == 1:
                luna_id = "g3ed293438f8_0_78"
                noches_id = "g3ed293438f8_0_79"
                cama_id = "g3ed293438f8_0_77"
                dorm_id = "g3ed293438f8_0_81"
                cafe_id = "g3ed293438f8_0_76"
                reg_id = "g3ed293438f8_0_80"
                y_icon = 5825180
                y_text = 5828730
            elif h_num == 2:
                luna_id = "g3ed293438f8_0_212"
                noches_id = "g3ed293438f8_0_213"
                cama_id = "g3ed293438f8_0_211"
                dorm_id = "g3ed293438f8_0_215"
                cafe_id = "g3ed293438f8_0_210"
                reg_id = "g3ed293438f8_0_214"
                y_icon = 7146659
                y_text = 7150209
            else: # h_num == 3
                luna_id = "g3ed293438f8_0_226"
                noches_id = "g3ed293438f8_0_227"
                cama_id = "g3ed293438f8_0_225"
                dorm_id = "g3ed293438f8_0_229"
                cafe_id = "g3ed293438f8_0_224"
                reg_id = "g3ed293438f8_0_228"
                y_icon = 9250695
                y_text = 9254245
                
            icon_w = 97000
            gap_icon_text = 120000
            gap_between_items = 150000
            char_w = 32000
            margin_w = 60000
            
            w_noches = len(noches_str) * char_w + margin_w
            w_dorm = len(dorm_str) * char_w + margin_w
            w_reg = len(reg_str) * char_w + margin_w
            
            total_width = (icon_w + gap_icon_text) * 3 + w_noches + w_dorm + w_reg + gap_between_items * 2
            x_right = 7050000
            start_x = x_right - total_width
            
            x_luna = start_x
            x_noches_text = start_x + icon_w + gap_icon_text
            x_cama = x_noches_text + w_noches + gap_between_items
            x_dorm_text = x_cama + icon_w + gap_icon_text
            x_cafe = x_dorm_text + w_dorm + gap_between_items
            x_reg_text = x_cafe + icon_w + gap_icon_text
            
            requests.append({
                "updatePageElementTransform": {
                    "objectId": luna_id,
                    "transform": {
                        "scaleX": 19.3295, "scaleY": 19.1361,
                        "translateX": x_luna, "translateY": y_icon,
                        "unit": "EMU"
                    },
                    "applyMode": "ABSOLUTE"
                }
            })
            requests.append({
                "updatePageElementTransform": {
                    "objectId": noches_id,
                    "transform": {
                        "scaleX": w_noches / 3000000.0, "scaleY": 0.0297,
                        "translateX": x_noches_text, "translateY": y_text,
                        "unit": "EMU"
                    },
                    "applyMode": "ABSOLUTE"
                }
            })
            requests.append({
                "updatePageElementTransform": {
                    "objectId": cama_id,
                    "transform": {
                        "scaleX": 19.3295, "scaleY": 19.1361,
                        "translateX": x_cama, "translateY": y_icon,
                        "unit": "EMU"
                    },
                    "applyMode": "ABSOLUTE"
                }
            })
            requests.append({
                "updatePageElementTransform": {
                    "objectId": dorm_id,
                    "transform": {
                        "scaleX": w_dorm / 3000000.0, "scaleY": 0.0297,
                        "translateX": x_dorm_text, "translateY": y_text,
                        "unit": "EMU"
                    },
                    "applyMode": "ABSOLUTE"
                }
            })
            requests.append({
                "updatePageElementTransform": {
                    "objectId": cafe_id,
                    "transform": {
                        "scaleX": 19.3295, "scaleY": 19.1361,
                        "translateX": x_cafe, "translateY": y_icon,
                        "unit": "EMU"
                    },
                    "applyMode": "ABSOLUTE"
                }
            })
            requests.append({
                "updatePageElementTransform": {
                    "objectId": reg_id,
                    "transform": {
                        "scaleX": w_reg / 3000000.0, "scaleY": 0.0297,
                        "translateX": x_reg_text, "translateY": y_text,
                        "unit": "EMU"
                    },
                    "applyMode": "ABSOLUTE"
                }
            })
            
            name_id = "g3ed293438f8_0_165" if h_num == 1 else ("g3ed293438f8_0_219" if h_num == 2 else "g3ed293438f8_0_233")
            name_ty = 5656794 if h_num == 1 else (6978528 if h_num == 2 else 8300153)
            requests.append({
                "updatePageElementTransform": {
                    "objectId": name_id,
                    "transform": {
                        "scaleX": 0.6833, "scaleY": 0.074,
                        "translateX": 1156866, "translateY": name_ty,
                        "unit": "EMU"
                    },
                    "applyMode": "ABSOLUTE"
                }
            })
            
            desc_id = "g3ed293438f8_0_167" if h_num == 1 else ("g3ed293438f8_0_221" if h_num == 2 else "g3ed293438f8_0_235")
            desc_ty = 5940000 if h_num == 1 else (7260000 if h_num == 2 else 8580000)
            requests.append({
                "updatePageElementTransform": {
                    "objectId": desc_id,
                    "transform": {
                        "scaleX": 0.9067, "scaleY": 0.1573,
                        "translateX": 477991, "translateY": desc_ty,
                        "unit": "EMU"
                    },
                    "applyMode": "ABSOLUTE"
                }
            })
            
            img_val = h.get("imagen1") or h.get("imagen")
            if img_val:
                url = upload_image_to_drive(drive_service, img_val, f"hotel_{h_num}_img_{h_name}.png", folder_id)
                if url:
                    ty_pos = 5610000 if h_num == 1 else (6930000 if h_num == 2 else 8250000)
                    requests.append({
                        "createImage": {
                            "url": url,
                            "elementProperties": {
                                "pageObjectId": slide_id,
                                "size": {
                                    "width": {"magnitude": 1300000, "unit": "EMU"},
                                    "height": {"magnitude": 760000, "unit": "EMU"},
                                },
                                "transform": {
                                    "scaleX": 1.0, "scaleY": 1.0,
                                    "translateX": 3150000, "translateY": ty_pos,
                                    "unit": "EMU",
                                },
                            },
                        }
                    })
        
        

            
    # Send the batchUpdate request
    print(f"Google Slides: Executing batch updates...")
    slides_service.presentations().batchUpdate(
        presentationId=presentation_id,
        body={'requests': requests}
    ).execute()
    print("Google Slides: Updates applied successfully.")
    
    return f"https://docs.google.com/presentation/d/{presentation_id}/edit"

# FastMCP Tool Registration
@mcp.tool()
def copy_and_fill_slides_template(template_id: str, folder_id: str, quote_json_str: str) -> str:
    """
    Exposes Slides replication as an MCP tool. Receives template ID, Drive destination folder ID, 
    and a JSON string of the quote details. Replaces placeholders and returns the online Slides URL.
    """
    try:
        quote_data = json.loads(quote_json_str)
        url = create_presentation_from_template(template_id, folder_id, quote_data)
        return f"Successfully generated presentation: {url}"
    except Exception as e:
        return f"Error executing tool: {str(e)}"

if __name__ == "__main__":
    print("Starting Google Slides MCP server...")
    mcp.run()
