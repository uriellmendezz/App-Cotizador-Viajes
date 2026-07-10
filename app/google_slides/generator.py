"""
google_slides_generator.py
Genera una presentación Google Slides completa desde cero, replicando
la estructura y estética de 'estructura-v3.json'.
"""

import os
import uuid
import json
import base64
import tempfile
from datetime import datetime

from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from dotenv import load_dotenv

load_dotenv()

# ── Dynamic Path Resolution ──────────────────────────────────────────────────
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CREDENTIALS_FILE = os.path.join(BASE_DIR, "config", "service_account.json")
TOKEN_FILE = os.path.join(BASE_DIR, "token.json")

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/presentations",
]

# ── Presentation page dimensions (A4 portrait in EMU) ──────────────────────
PAGE_W = 7556500   # width  ~210 mm
PAGE_H = 10693400  # height ~297 mm

# ── Guide boundaries (from template guides, 1cm = 914400 EMU) ────────────────
# Vertical guides at 1.05cm and 19.95cm (left/right limits)
# Horizontal guides at 1.05cm and 28.65cm (top/bottom limits)
GUIDE_LEFT   = int(1.05  * 914400)   # ≈  959620 EMU
GUIDE_RIGHT  = int(19.95 * 914400)   # ≈ 18242280 EMU
GUIDE_TOP    = int(1.05  * 914400)   # ≈  959620 EMU
GUIDE_BOTTOM = int(28.65 * 914400)   # ≈ 26193960 EMU

# ── Brand colours ────────────────────────────────────────────────────────────
RED_R, RED_G, RED_B       = 1.0, 0.32941177, 0.3647059     # #FF5450 accent
DARK_R, DARK_G, DARK_B    = 0.20392157, 0.20392157, 0.20392157  # #343434
GRAY_R, GRAY_G, GRAY_B    = 0.3372549, 0.3372549, 0.3372549     # #565656
LGRAY_R, LGRAY_G, LGRAY_B = 0.80784315, 0.80784315, 0.80784315  # #CECECE

# ── Icons (Public URLs) ──────────────────────────────────────────────────────
ICON_NOCHES    = "https://lh7-rt.googleusercontent.com/slidesz/AGV_vUeCGCm4cBwKwJEIKDNWUjxbq2W0XaSqUUB2rilZr4vjHbLhuAZj4Lg2wiPtES_7qDINKYtbvwtlqYGqgWlxiCo2wHLY0JRMWWKksciY-mhIiYpbc4yekr6z3NTFlDiENIxGLfQ4-ezQ_8n608Jx6PsqGRuI3ZDwhI9CkNNVZM-yM52DUFPHug=s2048?key=uQbEJ9oH0aCOp_VNKL_WBA"
ICON_DORMITORIO = "https://lh7-rt.googleusercontent.com/slidesz/AGV_vUdSZz4oE-4jXE3rmsZKxx2i1zVi3gQsk2vAt-W_1xcKRmybkyS5peu4Vb_GWfgnR7R4IOuWpL4_HAZUtmhMVEc_mMfjl3ug6yFdasL29qLqAh0tld8z6SHCi1oyDONYQz9uXQGNTBSW8gm85I9iijf87HEW9kYFuLutqQ1HNF62oR7uhXE=s2048?key=uQbEJ9oH0aCOp_VNKL_WBA"
ICON_REGIMEN   = "https://lh7-rt.googleusercontent.com/slidesz/AGV_vUeknZsjWClql_QTBlluIzVoFsUB5QILr6KwpoChFRGxtMb4k3TRIegQNpA07k8VR4e8WvFHXtwG8om5xSFtk_5k-BN2PFRoFTD4-UHGmg-x-9-RHfDprJ98wbDYrtUA1yv8JADk9zWFZu7Bza1zPe2leLOxS4YX-awuDdrceTFnzlS_aGI=s2048?key=uQbEJ9oH0aCOp_VNKL_WBA"

ICON_AVION     = "https://lh7-rt.googleusercontent.com/slidesz/AGV_vUenCzDVK0cxrSNHv-c6XEzqe2FtqrtOdtAq_zuXmPCk_9oSqvl12wBeIfe_9bUC3iMTU1UPshq3rFnQvoAa7fks_LldqwPr62cwpZsrzNMEQNpCzY_Fs-u3M_NhAtWi_PwiaAgZ9wQJ_8PP6nNdGn-8FH-mJY7z0IhyO3GUYONZLcktRhJkdg=s2048?key=uQbEJ9oH0aCOp_VNKL_WBA"
ICON_CAMA      = "https://lh7-rt.googleusercontent.com/slidesz/AGV_vUcv04aZDDoMz1cfx9HsTtuudLfWnXTrtM-3Xe3GsV7D_vSjgEn5j6_h0X12oFJd1y5m5gvww2Bb_8bgWi25vjE2EiWMmKMEM55IcjC-_Q6zfSXrUHm6KS-m_oycm4RPcfLFH8q9IESmDS95MqTuE61ZagpEjtLhAw3hdpWorrRA0kZxbUzSyg=s2048?key=uQbEJ9oH0aCOp_VNKL_WBA"
ICON_TRASLADO  = "https://lh7-rt.googleusercontent.com/slidesz/AGV_vUfR7gRyA6lDIO0Fo_JGhRfR5uodR1NLAKCjwfU4owjVlmAGSJai8XQ3NtH7onFVI_q7tAVs2MqVaFRLE5iEGZZ_UqXdlnmna3hdN_gCxcsT1mk-VsN_yLa-fER8HNZWTT7ck0fUTRKdTzsNxcDYKGrmMcZkQLw7p7ofgmQGvh_w8Aq1WqU=s2048?key=uQbEJ9oH0aCOp_VNKL_WBA"

# ═══════════════════════════════════════════════════════════════════════════════
# Helper utilities
# ═══════════════════════════════════════════════════════════════════════════════

def _id(prefix="el"):
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _rgb(r, g, b):
    return {"rgbColor": {"red": r, "green": g, "blue": b}}


def _pt(magnitude):
    return {"magnitude": magnitude, "unit": "PT"}


def _emu(magnitude):
    return {"magnitude": magnitude, "unit": "EMU"}


def _size(w_emu, h_emu):
    return {
        "width": _emu(w_emu),
        "height": _emu(h_emu),
    }


def _transform(tx=0, ty=0, sx=1.0, sy=1.0):
    return {
        "scaleX": sx, "scaleY": sy,
        "translateX": tx, "translateY": ty,
        "unit": "EMU",
    }


def _no_outline():
    return {
        "outlineFill": {"solidFill": {"color": _rgb(0, 0, 0), "alpha": 1}},
        "weight": _emu(9525),
        "dashStyle": "SOLID",
        "propertyState": "NOT_RENDERED",
    }


def _text_run(content, font="Montserrat", size_pt=10, bold=False, italic=False,
              r=DARK_R, g=DARK_G, b=DARK_B, weight=400, underline=False):
    return {
        "textRun": {
            "content": content,
            "style": {
                "backgroundColor": {},
                "foregroundColor": {
                    "opaqueColor": _rgb(r, g, b)
                },
                "bold": bold,
                "italic": italic,
                "fontFamily": font,
                "fontSize": _pt(size_pt),
                "baselineOffset": "NONE",
                "smallCaps": False,
                "strikethrough": False,
                "underline": underline,
                "weightedFontFamily": {
                    "fontFamily": font,
                    "weight": weight,
                },
            },
        }
    }


def _clamp_position(tx, ty, w, h):
    """Clamp element position so it stays within guide boundaries."""
    # Clamp left edge
    tx = max(tx, GUIDE_LEFT)
    # Clamp top edge
    ty = max(ty, GUIDE_TOP)
    # Clamp right edge (tx + w must not exceed right guide)
    if w > 0 and tx + w > GUIDE_RIGHT:
        tx = max(GUIDE_LEFT, GUIDE_RIGHT - w)
    # Clamp bottom edge (ty + h must not exceed bottom guide)
    if h > 0 and ty + h > GUIDE_BOTTOM:
        ty = max(GUIDE_TOP, GUIDE_BOTTOM - h)
    return tx, ty


def _paragraph_marker(alignment="LEFT", line_spacing=100):
    return {
        "paragraphMarker": {
            "style": {
                "lineSpacing": line_spacing,
                "alignment": alignment,
                "indentStart": {"unit": "PT"},
                "indentEnd": {"unit": "PT"},
                "spaceAbove": {"unit": "PT"},
                "spaceBelow": {"unit": "PT"},
                "indentFirstLine": {"unit": "PT"},
                "direction": "LEFT_TO_RIGHT",
                "spacingMode": "NEVER_COLLAPSE",
            }
        }
    }


def _solid_fill(r, g, b, alpha=1):
    return {"solidFill": {"color": _rgb(r, g, b), "alpha": alpha}}


def _no_fill():
    return {"propertyState": "NOT_RENDERED",
            "solidFill": {"color": _rgb(1, 1, 1), "alpha": 1}}


def _shape_props(fill=None, has_outline=False):
    props = {
        "shapeBackgroundFill": fill if fill else _no_fill(),
        "outline": _no_outline() if not has_outline else {
            "outlineFill": {"solidFill": {"color": _rgb(LGRAY_R, LGRAY_G, LGRAY_B), "alpha": 1}},
            "weight": _emu(9250),
            "dashStyle": "SOLID",
        },
        "shadow": {
            "type": "OUTER",
            "transform": _transform(),
            "alignment": "BOTTOM_LEFT",
            "blurRadius": {"unit": "EMU"},
            "color": _rgb(0, 0, 0),
            "alpha": 1,
            "rotateWithShape": False,
            "propertyState": "NOT_RENDERED",
        },
        "contentAlignment": "MIDDLE",
        "autofit": {"autofitType": "NONE", "fontScale": 1},
    }
    return props


def fmt_curr(val):
    try:
        return "USD ${:,.2f}".format(float(val)).replace(",", ".")
    except Exception:
        return "USD $0.00"


# ═══════════════════════════════════════════════════════════════════════════════
# Credentials
# ═══════════════════════════════════════════════════════════════════════════════

def get_credentials():
    """Load Google credentials, checking env variables first, then local files."""
    # 1. Try user token from environment variable (GOOGLE_TOKEN or GOOGLE_TOKEN_JSON)
    google_token_json = os.environ.get("GOOGLE_TOKEN") or os.environ.get("GOOGLE_TOKEN_JSON")
    if google_token_json:
        try:
            token_info = json.loads(google_token_json)
            return Credentials.from_authorized_user_info(token_info, SCOPES)
        except Exception as e:
            print(f"Error loading user token from environment variable: {e}")

    # 2. Try service account info from environment variable (GOOGLE_CREDENTIALS or GOOGLE_CREDS_JSON)
    google_creds_json = os.environ.get("GOOGLE_CREDENTIALS") or os.environ.get("GOOGLE_CREDS_JSON")
    if google_creds_json:
        try:
            creds_info = json.loads(google_creds_json)
            if creds_info.get("type") == "service_account":
                return service_account.Credentials.from_service_account_info(
                    creds_info, scopes=SCOPES
                )
            else:
                print("Environment credentials is not a service account. Skipping environment loading.")
        except Exception as e:
            print(f"Error loading service account from environment variable: {e}")

    # 3. Fallback to local files
    if os.path.exists(TOKEN_FILE):
        try:
            return Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        except Exception as e:
            print(f"Error loading local token.json: {e}")
            
    if os.path.exists(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE, "r") as f:
                info = json.load(f)
            if info.get("type") == "service_account":
                return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
        except Exception:
            pass
        try:
            return service_account.Credentials.from_service_account_file(
                CREDENTIALS_FILE, scopes=SCOPES
            )
        except Exception as e:
            print(f"Error loading local credentials.json: {e}")

    raise FileNotFoundError(
        f"Neither user token at '{TOKEN_FILE}' or environment variable GOOGLE_TOKEN/GOOGLE_TOKEN_JSON, "
        f"nor service account credentials at '{CREDENTIALS_FILE}' or environment variable GOOGLE_CREDENTIALS/GOOGLE_CREDS_JSON were found."
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Drive image upload
# ═══════════════════════════════════════════════════════════════════════════════

def upload_image_to_drive(drive_service, source, filename, folder_id=None):
    """
    Upload an image to Google Drive from a base64 string, URL, or local file path.
    Returns a publicly accessible URL.
    """
    if not source:
        return None

    tmp_path = None
    try:
        if isinstance(source, str) and source.startswith("data:image"):
            # base64 data URI
            _, b64data = source.split(",", 1)
            data = base64.b64decode(b64data)
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
            tmp.write(data)
            tmp.close()
            tmp_path = tmp.name
            mime = "image/png"
        elif isinstance(source, str) and (source.startswith("http://") or source.startswith("https://")):
            import requests
            r = requests.get(source, timeout=10)
            r.raise_for_status()
            ct = r.headers.get("content-type", "image/jpeg")
            suffix = ".jpg" if "jpeg" in ct or "jpg" in ct else ".png"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            tmp.write(r.content)
            tmp.close()
            tmp_path = tmp.name
            mime = ct.split(";")[0]
        elif isinstance(source, str) and os.path.exists(source):
            tmp_path = source
            mime = "image/png"
        else:
            return None

        meta = {"name": filename}
        if folder_id:
            meta["parents"] = [folder_id]

        media = MediaFileUpload(tmp_path, mimetype=mime, resumable=True)
        f = drive_service.files().create(
            body=meta, media_body=media, fields="id"
        ).execute()
        fid = f["id"]

        drive_service.permissions().create(
            fileId=fid,
            body={"type": "anyone", "role": "reader"},
        ).execute()

        return f"https://lh3.googleusercontent.com/d/{fid}"
    except Exception as e:
        print(f"[upload_image] Error uploading '{filename}': {e}")
        return None
    finally:
        if tmp_path and tmp_path != source and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


# ═══════════════════════════════════════════════════════════════════════════════
# Request builders for individual slide elements
# ═══════════════════════════════════════════════════════════════════════════════

def req_create_shape(oid, shape_type, tx, ty, sx=1.0, sy=1.0,
                      base_w=3000000, base_h=3000000):
    """Create a shape element on slide."""
    return {
        "createShape": {
            "objectId": oid,
            "shapeType": shape_type,
            "elementProperties": {
                "pageObjectId": None,  # will be filled
                "size": _size(base_w, base_h),
                "transform": _transform(tx, ty, sx, sy),
            },
        }
    }


def req_insert_text(oid, text):
    return {"insertText": {"objectId": oid, "text": text}}


def req_update_shape_fill(oid, r, g, b, alpha=1):
    return {
        "updateShapeProperties": {
            "objectId": oid,
            "shapeProperties": {
                "shapeBackgroundFill": {
                    "solidFill": {"color": _rgb(r, g, b), "alpha": alpha}
                }
            },
            "fields": "shapeBackgroundFill",
        }
    }


def req_update_outline_no_render(oid):
    return {
        "updateShapeProperties": {
            "objectId": oid,
            "shapeProperties": {
                "outline": {
                    "propertyState": "NOT_RENDERED"
                }
            },
            "fields": "outline",
        }
    }


def req_update_text_style(oid, r, g, b, size_pt, bold=False, italic=False,
                          font="Montserrat", weight=400,
                          start=None, end=None, underline=False):
    style = {
        "foregroundColor": {"opaqueColor": _rgb(r, g, b)},
        "bold": bold,
        "italic": italic,
        "underline": underline,
        "fontFamily": font,
        "fontSize": _pt(size_pt),
        "weightedFontFamily": {"fontFamily": font, "weight": weight},
    }
    fields = "foregroundColor,bold,italic,underline,fontFamily,fontSize,weightedFontFamily"
    obj = {
        "updateTextStyle": {
            "objectId": oid,
            "style": style,
            "fields": fields,
        }
    }
    if start is not None or end is not None:
        obj["updateTextStyle"]["textRange"] = {
            "type": "FIXED_RANGE",
            "startIndex": start or 0,
            "endIndex": end,
        }
    return obj


def req_update_paragraph_style(oid, alignment="LEFT", line_spacing=100):
    return {
        "updateParagraphStyle": {
            "objectId": oid,
            "style": {
                "alignment": alignment,
                "lineSpacing": line_spacing,
                "spacingMode": "NEVER_COLLAPSE",
            },
            "fields": "alignment,lineSpacing,spacingMode",
        }
    }


def req_create_image(oid, url, tx, ty, sx=1.0, sy=1.0,
                      base_w=3000000, base_h=3000000):
    return {
        "createImage": {
            "objectId": oid,
            "url": url,
            "elementProperties": {
                "pageObjectId": None,  # will be filled
                "size": _size(base_w, base_h),
                "transform": _transform(tx, ty, sx, sy),
            },
        }
    }

# ═══════════════════════════════════════════════════════════════════════════════
# Dynamic v2 Generation Engine
# ═══════════════════════════════════════════════════════════════════════════════

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

def build_presentation_requests(slide_id, quote, hotel_image_urls,
                                 vuelo_ida_url, vuelo_vuelta_url,
                                 logo_url=None):
    """
    Constructs a list of batchUpdate requests to populate a slide
    by reading structure from 'estructura-v3.json' and replacing values.
    """
    
    # 1. Load the v3 template structure
    template_path = os.path.join(BASE_DIR, "estructura-v3.json")
    if not os.path.exists(template_path):
        template_path = "estructura-v3.json"
        
    try:
        with open(template_path, "r", encoding="utf-8") as f:
            template_data = json.load(f)
    except Exception as e:
        print(f"Error loading {template_path}: {e}")
        raise FileNotFoundError(f"Could not load template JSON from {template_path}")
        
    slide = template_data["slides"][0]
    elements = slide.get("pageElements", [])
    
    requests = []
    
    passenger_name = quote.get("nombre_pax", "Pasajero")
    destination = quote.get("destino", "Destino")
    cant_pax = int(quote.get("cantidad_pasajeros", 1))
    noches_str = quote.get("noches_alojamiento", "7 noches")
    fecha_salida = quote.get("fecha_salida", "")
    fecha_ida = quote.get("fecha_vuelo_ida", "")
    fecha_vuelta = quote.get("fecha_vuelo_vuelta", "")
    today_str = datetime.now().strftime("%d/%m/%Y")
    
    def fmt_curr(val):
        try:
            return f"USD ${float(val):,.2f}".replace(",", ".")
        except (ValueError, TypeError):
            return "USD $0.00"
            
    base_habitacion = quote.get("base_habitacion", "Doble")
    hotels = quote.get("hoteles", [])
    
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
                "type": "shape" if "shape" in e else ("image" if "image" in e else ("line" if "line" in e else "unknown")),
                "abs_tx": abs_transform["translateX"],
                "abs_ty": abs_transform["translateY"],
                "abs_w": abs_w,
                "abs_h": abs_h,
                "scaleX": abs_transform["scaleX"],
                "scaleY": abs_transform["scaleY"]
            }
            
            if "shape" in e:
                shape = e["shape"]
                el_info["shapeType"] = shape.get("shapeType")
                text = ""
                all_text_elements = []
                if "text" in shape and "textElements" in shape["text"]:
                    text = "".join([t.get("textRun", {}).get("content", "") for t in shape["text"]["textElements"] if "textRun" in t])
                    # Capture ALL textRun elements with their styles and indices for rich typography
                    char_index = 0
                    for t in shape["text"]["textElements"]:
                        if "textRun" in t:
                            content = t["textRun"].get("content", "")
                            style = t["textRun"].get("style", {})
                            all_text_elements.append({
                                "content": content,
                                "start": char_index,
                                "end": char_index + len(content),
                                "style": style
                            })
                            char_index += len(content)
                el_info["text"] = text
                el_info["all_text_elements"] = all_text_elements
                
                props = shape.get("shapeProperties", {})
                bg_fill = props.get("shapeBackgroundFill", {})
                if "solidFill" in bg_fill:
                    el_info["fill"] = bg_fill["solidFill"].get("color", {}).get("rgbColor", {})
                else:
                    el_info["fill"] = None
                    
                # Keep first textStyle as fallback for global style
                el_info["textStyle"] = {}
                el_info["paragraphStyle"] = {}
                if "text" in shape and "textElements" in shape["text"]:
                    for t in shape["text"]["textElements"]:
                        if "textRun" in t and "style" in t["textRun"]:
                            el_info["textStyle"] = t["textRun"]["style"]
                            break
                    for t in shape["text"]["textElements"]:
                        if "paragraphMarker" in t and "style" in t["paragraphMarker"]:
                            el_info["paragraphStyle"] = t["paragraphMarker"]["style"]
                            break
            elif "image" in e:
                el_info["url"] = e["image"].get("contentUrl", "")
            elif "line" in e:
                line_props = e["line"].get("lineProperties", {})
                el_info["weight"] = line_props.get("weight", {}).get("magnitude", 9525)
                el_info["color"] = line_props.get("lineFill", {}).get("solidFill", {}).get("color", {}).get("rgbColor", {})
                
            absolute_elements.append(el_info)
            
    for e in elements:
        traverse(e)
        
    hotel_2_element_ids = [
        "g3f1aacc1efc_0_371", "g3f1aacc1efc_0_372", "g3f1aacc1efc_0_373", "g3f1aacc1efc_0_374", "g3f1aacc1efc_0_375",
        "g3f1aacc1efc_0_376", "g3f1aacc1efc_0_377", "g3f1aacc1efc_0_378", "g3f1aacc1efc_0_379", "g3f1aacc1efc_0_380",
        "g3f1aacc1efc_0_381", "g3f1aacc1efc_0_382", "g3f1aacc1efc_0_383", "g3f1aacc1efc_0_384"
    ]
    hotel_3_element_ids = [
        "g3f1aacc1efc_0_386", "g3f1aacc1efc_0_387", "g3f1aacc1efc_0_388", "g3f1aacc1efc_0_389", "g3f1aacc1efc_0_390",
        "g3f1aacc1efc_0_391", "g3f1aacc1efc_0_392", "g3f1aacc1efc_0_393", "g3f1aacc1efc_0_394", "g3f1aacc1efc_0_395",
        "g3f1aacc1efc_0_396", "g3f1aacc1efc_0_397", "g3f1aacc1efc_0_398", "g3f1aacc1efc_0_399"
    ]
    
    # Calculate aligned coordinates for Nights, Room, and Board metadata elements
    aligned_x_map = {}
    aligned_y_map = {}
    
    # We need to map the placeholders to get card boundaries
    hotel_image_placeholders = {}
    for el in absolute_elements:
        oid = el["objectId"]
        if oid == "g3f1aacc1efc_0_357":
            hotel_image_placeholders[1] = el
        elif oid == "g3f1aacc1efc_0_374":
            hotel_image_placeholders[2] = el
        elif oid == "g3f1aacc1efc_0_389":
            hotel_image_placeholders[3] = el
            
    # Compute aligned positions for each hotel
    for h_num in [1, 2, 3]:
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
                
        placeholder = hotel_image_placeholders.get(h_num)
        if placeholder:
            card_base_tx = placeholder["abs_tx"]
            card_base_w = placeholder["abs_w"]
        else:
            card_base_tx = 441609
            card_base_w = 1770126
            
        if len(el_map) == 6:
            target_y = el_map[nights_id]["abs_ty"]
            
            w_icon1, w_text1 = el_map[nights_icon_id]["abs_w"], el_map[nights_id]["abs_w"]
            w_icon2, w_text2 = el_map[board_icon_id]["abs_w"], el_map[board_id]["abs_w"]
            w_icon3, w_text3 = el_map[room_icon_id]["abs_w"], el_map[room_id]["abs_w"]
            
            gap = 35000  # subtle gap between icon and text
            
            gw1 = w_icon1 + gap + w_text1
            gw2 = w_icon2 + gap + w_text2
            gw3 = w_icon3 + gap + w_text3
            
            W = card_base_w
            X0 = card_base_tx
            
            space = (W - (gw1 + gw2 + gw3)) / 2.0
            
            # Nights Group
            aligned_x_map[nights_icon_id] = X0
            aligned_x_map[nights_id] = X0 + w_icon1 + gap
            
            # Board Group
            x2_start = X0 + gw1 + space
            aligned_x_map[board_icon_id] = x2_start
            aligned_x_map[board_id] = x2_start + w_icon2 + gap
            
            # Room Group
            x3_start = X0 + W - gw3
            aligned_x_map[room_icon_id] = x3_start
            aligned_x_map[room_id] = x3_start + w_icon3 + gap
            
            # Set target Y for all 6 elements
            for o_id in [nights_id, board_id, room_id, nights_icon_id, board_icon_id, room_icon_id]:
                aligned_y_map[o_id] = target_y

    # We will generate requests for each leaf element
    vuelo_ida_placeholder = None
    vuelo_vuelta_placeholder = None
    hotel_image_placeholders = {}

    for el in absolute_elements:
        oid = el["objectId"]
        
        # Collect absolute transforms of placeholders to position new images dynamically
        if oid == "g3f1aacc1efc_0_351":
            vuelo_ida_placeholder = el
        elif oid == "g3f1aacc1efc_0_352":
            vuelo_vuelta_placeholder = el
        elif oid == "g3f1aacc1efc_0_357":
            hotel_image_placeholders[1] = el
        elif oid == "g3f1aacc1efc_0_374":
            hotel_image_placeholders[2] = el
        elif oid == "g3f1aacc1efc_0_389":
            hotel_image_placeholders[3] = el

        if oid in hotel_3_element_ids and len(hotels) < 3:
            continue
        if oid in hotel_2_element_ids and len(hotels) < 2:
            continue
            
        if oid in ["g3f1aacc1efc_0_364", "g3f1aacc1efc_0_381", "g3f1aacc1efc_0_396"]:
            continue
            
        if oid in ["g3f1aacc1efc_0_351", "g3f1aacc1efc_0_352", "g3f1aacc1efc_0_357", "g3f1aacc1efc_0_374", "g3f1aacc1efc_0_389"]:
            continue
            
        if el["type"] == "shape":
            new_oid = _id("shp") if not oid.startswith("g3f") else oid
            
            # Apply boundary clamping or aligned positions
            tx_to_use = aligned_x_map.get(oid, el["abs_tx"])
            ty_to_use = aligned_y_map.get(oid, el["abs_ty"])
            # Apply boundary clamping to keep elements within guide limits
            clamped_tx, clamped_ty = _clamp_position(
                tx_to_use, ty_to_use, el["abs_w"], el["abs_h"]
            )
            
            # Make the price and total text boxes wider to prevent wrapping and keep them centered
            shape_w = el["abs_w"]
            shape_tx = clamped_tx
            is_price_oid = oid in ["g3f1aacc1efc_0_366", "g3f1aacc1efc_0_383", "g3f1aacc1efc_0_398"]
            is_sub_oid = oid in ["g3f1aacc1efc_0_367", "g3f1aacc1efc_0_384", "g3f1aacc1efc_0_399"]
            if is_price_oid or is_sub_oid:
                w_factor = 1.35
                shape_w = el["abs_w"] * w_factor
                shape_tx = clamped_tx - (el["abs_w"] * (w_factor - 1.0) / 2.0)
            
            requests.append({
                "createShape": {
                    "objectId": new_oid,
                    "shapeType": el["shapeType"],
                    "elementProperties": {
                        "pageObjectId": slide_id,
                        "size": {
                            "width": {"magnitude": shape_w, "unit": "EMU"},
                            "height": {"magnitude": el["abs_h"], "unit": "EMU"}
                        },
                        "transform": {
                            "scaleX": 1.0, "scaleY": 1.0,
                            "translateX": shape_tx, "translateY": clamped_ty,
                            "unit": "EMU"
                        }
                    }
                }
            })
            
            if el["fill"]:
                requests.append({
                    "updateShapeProperties": {
                        "objectId": new_oid,
                        "shapeProperties": {
                            "shapeBackgroundFill": {
                                "solidFill": {
                                    "color": {
                                        "rgbColor": el["fill"]
                                    },
                                    "alpha": 1
                                }
                            }
                        },
                        "fields": "shapeBackgroundFill"
                    }
                })
            else:
                requests.append({
                    "updateShapeProperties": {
                        "objectId": new_oid,
                        "shapeProperties": {
                            "shapeBackgroundFill": {
                                "propertyState": "NOT_RENDERED"
                            }
                        },
                        "fields": "shapeBackgroundFill"
                    }
                })
                
            requests.append({
                "updateShapeProperties": {
                    "objectId": new_oid,
                    "shapeProperties": {
                        "outline": {
                            "propertyState": "NOT_RENDERED"
                        }
                    },
                    "fields": "outline"
                }
            })
            
            raw_text = el.get("text", "")
            if raw_text or oid in ["g3f1aacc1efc_0_356", "g3f1aacc1efc_0_373", "g3f1aacc1efc_0_388"]:
                text_val = raw_text
                
                if oid in ["g3f1aacc1efc_0_356", "g3f1aacc1efc_0_373", "g3f1aacc1efc_0_388"]:
                    h_idx = 0 if oid == "g3f1aacc1efc_0_356" else (1 if oid == "g3f1aacc1efc_0_373" else 2)
                    h = hotels[h_idx]
                    stars_count = get_stars_count(h.get("estrellas"))
                    set_hotel_name_and_stars(requests, new_oid, h.get("nombre", ""), stars_count, is_recomendacion=(h_idx == 0))
                    continue
                    
                if "<<PASAJERO>>" in text_val: text_val = text_val.replace("<<PASAJERO>>", passenger_name)
                if "<<DESTINO>>" in text_val: text_val = text_val.replace("<<DESTINO>>", destination)
                if "<<FECHA_SALIDA>>" in text_val: text_val = text_val.replace("<<FECHA_SALIDA>>", fecha_salida)
                if "<<FECHA_VUELO_IDA>>" in text_val: text_val = text_val.replace("<<FECHA_VUELO_IDA>>", fecha_ida)
                if "<<FECHA_VUELO_VUELTA>>" in text_val: text_val = text_val.replace("<<FECHA_VUELO_VUELTA>>", fecha_vuelta)
                if "<<FECHA COTIZACION>>" in text_val: text_val = text_val.replace("<<FECHA COTIZACION>>", today_str)
                
                if oid == "g3f1aacc1efc_0_451":
                    pax_str = "un pasajero" if cant_pax == 1 else f"{cant_pax} pasajeros"
                    text_val = f"Vuelos desde {quote.get('origen', '')} hacia {destination} para {pax_str}."
                elif oid == "g3f1aacc1efc_0_445":
                    text_val = f"Estadía en {destination} por {noches_str}."
                elif oid == "g3f1aacc1efc_0_448":
                    text_val = quote.get("detalle_traslado", "Traslados de llegada y regreso (Aeropuerto/Hotel/Aeropuerto)")
                
                for idx in range(min(len(hotels), 3)):
                    h = hotels[idx]
                    n = idx + 1
                    if oid == ("g3f1aacc1efc_0_355" if n == 1 else ("g3f1aacc1efc_0_372" if n == 2 else "g3f1aacc1efc_0_387")):
                        text_val = h.get("descripcion", "")
                    elif oid == ("g3f1aacc1efc_0_361" if n == 1 else ("g3f1aacc1efc_0_378" if n == 2 else "g3f1aacc1efc_0_393")):
                        text_val = h.get("noches", noches_str)
                    elif oid == ("g3f1aacc1efc_0_363" if n == 1 else ("g3f1aacc1efc_0_380" if n == 2 else "g3f1aacc1efc_0_395")):
                        text_val = h.get("habitacion", "1 dormitorio")
                    elif oid == ("g3f1aacc1efc_0_362" if n == 1 else ("g3f1aacc1efc_0_379" if n == 2 else "g3f1aacc1efc_0_394")):
                        text_val = h.get("regimen", "All Inclusive")
                    elif oid == ("g3f1aacc1efc_0_366" if n == 1 else ("g3f1aacc1efc_0_383" if n == 2 else "g3f1aacc1efc_0_398")):
                        text_val = fmt_curr(h.get("precio_persona", 0.0))
                    elif oid == ("g3f1aacc1efc_0_367" if n == 1 else ("g3f1aacc1efc_0_384" if n == 2 else "g3f1aacc1efc_0_399")):
                        text_val = f"por persona en Base {base_habitacion}. {fmt_curr(h.get('costo', 0.0))} en total."
                        
                requests.append({
                    "insertText": {
                        "objectId": new_oid,
                        "text": text_val,
                        "insertionIndex": 0
                    }
                })
                
                # Adjust font size for price and subtitle to prevent wrapping
                is_price_oid = oid in ["g3f1aacc1efc_0_366", "g3f1aacc1efc_0_383", "g3f1aacc1efc_0_398"]
                is_sub_oid = oid in ["g3f1aacc1efc_0_367", "g3f1aacc1efc_0_384", "g3f1aacc1efc_0_399"]
                if is_price_oid or is_sub_oid:
                    n_val = 1 if oid in ["g3f1aacc1efc_0_366", "g3f1aacc1efc_0_367"] else (2 if oid in ["g3f1aacc1efc_0_383", "g3f1aacc1efc_0_384"] else 3)
                    if is_price_oid:
                        f_size = 14 if n_val == 1 else 11
                    else:
                        f_size = 8.5 if n_val == 1 else 7.5
                    requests.append({
                        "updateTextStyle": {
                            "objectId": new_oid,
                            "textRange": {"type": "ALL"},
                            "style": {
                                "fontSize": {"magnitude": f_size, "unit": "PT"}
                            },
                            "fields": "fontSize"
                        }
                    })
                
                # User style overrides
                is_desc_oid = oid in ["g3f1aacc1efc_0_355", "g3f1aacc1efc_0_372", "g3f1aacc1efc_0_387"]
                is_title_oid = oid == "g3f1aacc1efc_0_339"
                
                # Apply rich typography: if the element has multiple text runs with
                # different styles (bold, italic, size, color), apply them per range.
                all_text_els = el.get("all_text_elements", [])
                has_mixed_styles = len(all_text_els) > 1
                
                if has_mixed_styles:
                    # Apply per-run styles using FIXED_RANGE
                    for run in all_text_els:
                        run_style = run["style"]
                        run_fg = run_style.get("foregroundColor", {}).get("opaqueColor", {})
                        run_size = run_style.get("fontSize", {}).get("magnitude", 10)
                        run_family = run_style.get("fontFamily", "Montserrat")
                        run_bold = run_style.get("bold", False)
                        run_italic = run_style.get("italic", False)
                        run_underline = run_style.get("underline", False)
                        run_weight = run_style.get("weightedFontFamily", {}).get("weight", 400)
                        
                        if is_desc_oid:
                            run_size = 7
                        elif is_title_oid:
                            run_weight = 900
                            run_bold = True
                            
                        run_style_body = {
                            "fontFamily": run_family,
                            "fontSize": {"magnitude": run_size, "unit": "PT"},
                            "bold": run_bold,
                            "italic": run_italic,
                            "underline": run_underline,
                            "weightedFontFamily": {"fontFamily": run_family, "weight": run_weight}
                        }
                        run_style_fields = "fontFamily,fontSize,bold,italic,underline,weightedFontFamily"
                        if run_fg:
                            run_style_body["foregroundColor"] = {"opaqueColor": run_fg}
                            run_style_fields += ",foregroundColor"
                        
                        requests.append({
                            "updateTextStyle": {
                                "objectId": new_oid,
                                "textRange": {
                                    "type": "FIXED_RANGE",
                                    "startIndex": run["start"],
                                    "endIndex": run["end"]
                                },
                                "style": run_style_body,
                                "fields": run_style_fields
                            }
                        })
                else:
                    # Single run — apply global style
                    font_style = el.get("textStyle", {})
                    fg_color = font_style.get("foregroundColor", {}).get("opaqueColor", {})
                    font_size = font_style.get("fontSize", {}).get("magnitude", 10)
                    font_family = font_style.get("fontFamily", "Montserrat")
                    bold = font_style.get("bold", False)
                    italic = font_style.get("italic", False)
                    underline = font_style.get("underline", False)
                    weight = font_style.get("weightedFontFamily", {}).get("weight", 400)
                    
                    if is_desc_oid:
                        font_size = 7
                    elif is_title_oid:
                        weight = 900
                        bold = True
                        
                    style_fields = "fontFamily,fontSize,bold,italic,underline,weightedFontFamily"
                    style_body = {
                        "fontFamily": font_family,
                        "fontSize": {"magnitude": font_size, "unit": "PT"},
                        "bold": bold,
                        "italic": italic,
                        "underline": underline,
                        "weightedFontFamily": {"fontFamily": font_family, "weight": weight}
                    }
                    if fg_color:
                        style_body["foregroundColor"] = {"opaqueColor": fg_color}
                        style_fields += ",foregroundColor"
                        
                    requests.append({
                        "updateTextStyle": {
                            "objectId": new_oid,
                            "style": style_body,
                            "fields": style_fields
                        }
                    })
                
                para_style = el.get("paragraphStyle", {})
                alignment = para_style.get("alignment", "START")
                requests.append({
                    "updateParagraphStyle": {
                        "objectId": new_oid,
                        "style": {
                            "alignment": alignment
                        },
                        "fields": "alignment"
                    }
                })
                
        elif el["type"] == "line":
            new_oid = _id("ln") if not oid.startswith("g3f") else oid
            requests.append({
                "createLine": {
                    "objectId": new_oid,
                    "lineCategory": "STRAIGHT",
                    "elementProperties": {
                        "pageObjectId": slide_id,
                        "size": {
                            "width": {"magnitude": el["abs_w"], "unit": "EMU"},
                            "height": {"magnitude": el["abs_h"], "unit": "EMU"}
                        },
                        "transform": {
                            "scaleX": el["scaleX"], "scaleY": el["scaleY"],
                            "translateX": el["abs_tx"], "translateY": el["abs_ty"],
                            "unit": "EMU"
                        }
                    }
                }
            })
            requests.append({
                "updateLineProperties": {
                    "objectId": new_oid,
                    "lineProperties": {
                        "lineFill": {
                            "solidFill": {
                                "color": {"rgbColor": el["color"]},
                                "alpha": 1
                            }
                        },
                        "weight": {"magnitude": el["weight"], "unit": "EMU"},
                        "dashStyle": "SOLID"
                    },
                    "fields": "lineFill,weight,dashStyle"
                }
            })
            
        elif el["type"] == "image":
            new_oid = _id("img") if not oid.startswith("g3f") else oid
            image_url = None
            
            if oid == "g3f1aacc1efc_0_350":  # Logo
                image_url = logo_url or el["url"]
            elif oid in ["g3f1aacc1efc_0_360", "g3f1aacc1efc_0_377", "g3f1aacc1efc_0_392"]:  # Nights icon
                image_url = ICON_NOCHES
            elif oid in ["g3f1aacc1efc_0_359", "g3f1aacc1efc_0_376", "g3f1aacc1efc_0_391"]:  # Room icon
                image_url = ICON_DORMITORIO
            elif oid in ["g3f1aacc1efc_0_358", "g3f1aacc1efc_0_375", "g3f1aacc1efc_0_390"]:  # Board icon
                image_url = ICON_REGIMEN
            elif oid == "g3f1aacc1efc_0_450":  # Flight icon checklist
                image_url = ICON_AVION
            elif oid == "g3f1aacc1efc_0_444":  # Hotel icon checklist
                image_url = ICON_CAMA
            elif oid == "g3f1aacc1efc_0_447":  # Transfer icon checklist
                image_url = ICON_TRASLADO
            else:
                image_url = el["url"]
                
            if image_url:
                # Apply boundary clamping to images too
                img_tx_val = aligned_x_map.get(oid, el["abs_tx"])
                img_ty_val = aligned_y_map.get(oid, el["abs_ty"])
                img_tx, img_ty = _clamp_position(
                    img_tx_val, img_ty_val, el["abs_w"], el["abs_h"]
                )
                requests.append({
                    "createImage": {
                        "url": image_url,
                        "elementProperties": {
                            "pageObjectId": slide_id,
                            "size": {
                                "width": {"magnitude": el["abs_w"], "unit": "EMU"},
                                "height": {"magnitude": el["abs_h"], "unit": "EMU"}
                            },
                            "transform": {
                                "scaleX": 1.0, "scaleY": 1.0,
                                "translateX": img_tx, "translateY": img_ty,
                                "unit": "EMU"
                            }
                        }
                    }
                })
                
    if vuelo_ida_url:
        if vuelo_ida_placeholder:
            tx = vuelo_ida_placeholder["abs_tx"]
            ty = vuelo_ida_placeholder["abs_ty"]
            w = vuelo_ida_placeholder["abs_w"]
            h = vuelo_ida_placeholder["abs_h"]
        else:
            tx, ty, w, h = 308900, 4096225, 3246549, 446675
        requests.append({
            "createImage": {
                "url": vuelo_ida_url,
                "elementProperties": {
                    "pageObjectId": slide_id,
                    "size": {
                        "width": {"magnitude": w, "unit": "EMU"},
                        "height": {"magnitude": h, "unit": "EMU"}
                    },
                    "transform": {
                        "scaleX": 1.0, "scaleY": 1.0,
                        "translateX": tx, "translateY": ty,
                        "unit": "EMU"
                    }
                }
            }
        })
    if vuelo_vuelta_url:
        if vuelo_vuelta_placeholder:
            tx = vuelo_vuelta_placeholder["abs_tx"]
            ty = vuelo_vuelta_placeholder["abs_ty"]
            w = vuelo_vuelta_placeholder["abs_w"]
            h = vuelo_vuelta_placeholder["abs_h"]
        else:
            tx, ty, w, h = 3623050, 4145225, 3526549, 403499
        requests.append({
            "createImage": {
                "url": vuelo_vuelta_url,
                "elementProperties": {
                    "pageObjectId": slide_id,
                    "size": {
                        "width": {"magnitude": w, "unit": "EMU"},
                        "height": {"magnitude": h, "unit": "EMU"}
                    },
                    "transform": {
                        "scaleX": 1.0, "scaleY": 1.0,
                        "translateX": tx, "translateY": ty,
                        "unit": "EMU"
                    }
                }
            }
        })
        
    for idx in range(min(len(hotels), 3)):
        h = hotels[idx]
        h_num = idx + 1
        uploaded_imgs = h.get("uploaded_images", [])
        
        # Resolve dynamic positioning based on template placeholder
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
            
        if uploaded_imgs:
            url_main = uploaded_imgs[0]
            if len(uploaded_imgs) == 1:
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
                        }
                    }
                })
            else:
                # Reduced size main image to leave room for gallery
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
                        }
                    }
                })
                
                # Dynamic gallery images side-by-side in the bottom 25% of the placeholder
                gallery_images = uploaded_imgs[1:3]
                gap = 60000  # subtle gap between gallery photos (approx 1.6mm)
                small_w = (card_base_w - gap) / 2
                small_h = card_base_h * 0.25
                small_ty = card_base_ty + card_base_h * 0.75
                
                for g_idx, g_img in enumerate(gallery_images):
                    requests.append({
                        "createImage": {
                            "url": g_img,
                            "elementProperties": {
                                "pageObjectId": slide_id,
                                "size": {
                                    "width": {"magnitude": small_w, "unit": "EMU"},
                                    "height": {"magnitude": small_h, "unit": "EMU"},
                                },
                                "transform": {
                                    "scaleX": 1.0, "scaleY": 1.0,
                                    "translateX": card_base_tx + g_idx * (small_w + gap), "translateY": small_ty,
                                    "unit": "EMU",
                                },
                            }
                        }
                    })
                    
    return requests

def create_quotation_presentation(quote_data: dict,
                                   folder_id: str = None) -> str:
    """
    Creates a brand-new Google Slides presentation from scratch,
    matching the design of estructura-v3.json.

    Returns the editable URL of the new presentation.
    """
    creds = get_credentials()
    drive_service  = build("drive",  "v3", credentials=creds)
    slides_service = build("slides", "v1", credentials=creds)

    # ── 1. Create a blank presentation ──────────────────────────────────────
    from datetime import datetime
    passenger = quote_data.get("nombre_pax", "Pasajero")
    destino   = quote_data.get("destino", "Destino")
    today_fn = datetime.now().strftime("%d-%m-%Y_%H-%M-%S")
    title     = f"Cotización - {passenger} - {destino} - {today_fn}"

    print(f"[Slides] Creating new presentation: '{title}'")
    pres = slides_service.presentations().create(
        body={
            "title": title,
            "pageSize": {
                "width":  {"magnitude": PAGE_W, "unit": "EMU"},
                "height": {"magnitude": PAGE_H, "unit": "EMU"},
            },
        }
    ).execute()

    pres_id  = pres["presentationId"]
    slide_id = pres["slides"][0]["objectId"]   # first (blank) slide
    print(f"[Slides] Presentation ID: {pres_id}, Slide ID: {slide_id}")

    # ── 2. Move to destination folder ───────────────────────────────────────
    if folder_id:
        print(f"[Slides] Moving to folder: {folder_id}")
        drive_service.files().update(
            fileId=pres_id,
            addParents=folder_id,
            fields="id, parents",
        ).execute()

    # ── 3. Share with anyone ─────────────────────────────────────────────────
    drive_service.permissions().create(
        fileId=pres_id,
        body={"type": "anyone", "role": "writer"},
    ).execute()

    # ── 4. Upload images to Drive for all hotels ─────────────────────────────
    print("[Slides] Uploading images to Drive…")
    hoteles = quote_data.get("hoteles", [])
    for idx, h in enumerate(hoteles[:3]):
        h_num = idx + 1
        h["uploaded_images"] = []
        for key in ("imagen", "imagen1", "imagen2", "imagen3"):
            src = h.get(key)
            if src:
                url = upload_image_to_drive(
                    drive_service, src, f"hotel_{h_num}_{key}_{passenger}.png", folder_id
                )
                if url:
                    h["uploaded_images"].append(url)
                    
        if "imagenes" in h and isinstance(h["imagenes"], list):
            for img_idx, src in enumerate(h["imagenes"]):
                if src and src not in h.get("uploaded_images", []):
                    url = upload_image_to_drive(
                        drive_service, src, f"hotel_{h_num}_img_{img_idx}_{passenger}.png", folder_id
                    )
                    if url:
                        h["uploaded_images"].append(url)

    vuelo_ida_url = None
    if quote_data.get("img_vuelo_ida"):
        vuelo_ida_url = upload_image_to_drive(
            drive_service,
            quote_data["img_vuelo_ida"],
            f"vuelo_ida_{passenger}.png",
            folder_id,
        )

    vuelo_vuelta_url = None
    if quote_data.get("img_vuelo_vuelta"):
        vuelo_vuelta_url = upload_image_to_drive(
            drive_service,
            quote_data["img_vuelo_vuelta"],
            f"vuelo_vuelta_{passenger}.png",
            folder_id,
        )

    logo_url = None
    if quote_data.get("agencia_logo_base64"):
        logo_url = upload_image_to_drive(
            drive_service,
            quote_data["agencia_logo_base64"],
            f"logo_{passenger}.png",
            folder_id,
        )

    # ── 5. Build requests ────────────────────────────────────────────────────
    print("[Slides] Building slide requests…")
    requests_list = build_presentation_requests(
        slide_id=slide_id,
        quote=quote_data,
        hotel_image_urls=[],
        vuelo_ida_url=vuelo_ida_url,
        vuelo_vuelta_url=vuelo_vuelta_url,
        logo_url=logo_url,
    )

    # ── 6. Execute batch update ──────────────────────────────────────────────
    print(f"[Slides] Executing {len(requests_list)} requests…")
    slides_service.presentations().batchUpdate(
        presentationId=pres_id,
        body={"requests": requests_list},
    ).execute()
    print("[Slides] Presentation created successfully.")

    return f"https://docs.google.com/presentation/d/{pres_id}/edit"
