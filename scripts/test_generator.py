import sys
import os
from xhtml2pdf import pisa
from jinja2 import Environment, FileSystemLoader

# Setup base directory dynamic path resolution and add to sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from app.google_slides.pptx_generator import generate_pptx

# Mock quote data
quote = {
    "nombre_pax": "Mariana Lopez",
    "cantidad_pasajeros": 2,
    "destino": "Punta Cana",
    "fecha_salida": "20/11/2024",
    "origen": "Córdoba",
    "monto_vuelos": 1500.0,
    "fee_aereo_percent": 10.0,
    "fee_aereo": 150.0,
    "monto_traslados": 200.0,
    "gastos_iva": 100.0,
    "fecha_vuelo_ida": "20/11/2024",
    "fecha_vuelo_vuelta": "27/11/2024",
    "vuelo_ida_info": "AR1302 - 08:00 AM",
    "vuelo_vuelta_info": "AR1303 - 18:00 PM",
    "agente_nombre": "Uriel",
    "agencia_nombre": "One Trip Giordano",
    "agencia_logo": os.path.join(BASE_DIR, "assets", "Banner letra O.png"),
    "agencia_colores": ["#ff545d", "#343434", "#f79646"],
    "colores": ["#ff545d", "#343434", "#f79646"],
    "costo_total": 2750.0,
    "precio_persona": 1375.0,
    "base_habitacion": "Doble",
    "noches_alojamiento": "7 noches",
    "hoteles": [
        {
            "nombre": "Iberostar Selection",
            "descripcion": "Complejo all-inclusive frente al mar, ideal para familias y parejas.",
            "estrellas": "★★★★★",
            "regimen": "All Inclusive",
            "habitacion": "Suite Estándar",
            "costo": 2750.0,
            "precio_persona": 1375.0,
            "imagen": os.path.join(BASE_DIR, "assets", "cama.png")
        },
        {
            "nombre": "Bahia Principe Luxury",
            "descripcion": "Resort de lujo con playas de arena blanca y campos de golf.",
            "estrellas": "★★★★★",
            "regimen": "All Inclusive",
            "habitacion": "Junior Suite",
            "costo": 3100.0,
            "precio_persona": 1550.0,
            "imagen": os.path.join(BASE_DIR, "assets", "cama.png")
        }
    ]
}

def link_callback(uri, rel):
    import urllib.parse
    parsed = urllib.parse.urlparse(uri)
    if parsed.scheme == 'file':
        path = parsed.path
        if path.startswith('/'):
            if os.name == 'nt' and len(path) > 2 and path[2] == ':':
                path = path[1:]
            else:
                path = path.lstrip('/')
        path = os.path.normpath(path)
        if os.path.exists(path):
            return path
    elif not parsed.scheme:
        path = os.path.normpath(uri)
        if os.path.isabs(path) and os.path.exists(path):
            return path
        abs_path = os.path.join(BASE_DIR, uri)
        if os.path.exists(abs_path):
            return os.path.abspath(abs_path)
        if os.path.exists(path):
            return os.path.abspath(path)
    return uri

def test_generation():
    import logging
    logging.basicConfig(level=logging.DEBUG)
    print("Testing PDF Generation (xhtml2pdf)...")
    
    # Register Montserrat font in ReportLab
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    try:
        font_regular = os.path.join(BASE_DIR, 'Montserrat', 'static', 'Montserrat-Regular.ttf')
        font_bold = os.path.join(BASE_DIR, 'Montserrat', 'static', 'Montserrat-Bold.ttf')
        font_black = os.path.join(BASE_DIR, 'Montserrat', 'static', 'Montserrat-Black.ttf')
        
        pdfmetrics.registerFont(TTFont('Montserrat', font_regular))
        pdfmetrics.registerFont(TTFont('Montserrat-Bold', font_bold))
        pdfmetrics.registerFont(TTFont('Montserrat-Black', font_black))
        pdfmetrics.registerFontFamily('Montserrat', normal='Montserrat', bold='Montserrat-Bold')
        print("Montserrat fonts registered in ReportLab successfully.")
        
        # Inject Montserrat mappings globally into xhtml2pdf DEFAULT_FONT
        import xhtml2pdf.default
        xhtml2pdf.default.DEFAULT_FONT.update({
            'montserrat': 'Montserrat',
            'montserrat-bold': 'Montserrat-Bold',
            'montserrat-black': 'Montserrat-Black',
            'montserrat_00': 'Montserrat',
            'montserrat_10': 'Montserrat-Bold',
            'montserrat_01': 'Montserrat',
            'montserrat_11': 'Montserrat-Bold',
            'montserrat-black_00': 'Montserrat-Black',
            'montserrat-black_10': 'Montserrat-Black',
            'montserrat-black_01': 'Montserrat-Black',
            'montserrat-black_11': 'Montserrat-Black',
        })
        print("Montserrat fonts injected into xhtml2pdf DEFAULT_FONT successfully.")
    except Exception as e:
        print(f"Error registering font: {e}")
        
    env = Environment(loader=FileSystemLoader(os.path.join(BASE_DIR, "templates")))
    template = env.get_template("cotizacion_pdf.html")
    html_content = template.render(**quote)
    
    os.makedirs(os.path.join(BASE_DIR, "test_output"), exist_ok=True)
    pdf_path = os.path.join(BASE_DIR, "test_output", "test_cotizacion.pdf")
    with open(pdf_path, "wb") as result_file:
        pisa_status = pisa.CreatePDF(html_content, dest=result_file, link_callback=link_callback)
        
    if not pisa_status.err:
        print(f"PDF generated successfully at {pdf_path}")
    else:
        print("Error during PDF generation")
    
    print("Testing PPTX Generation...")
    pptx_path = os.path.join(BASE_DIR, "test_output", "test_cotizacion.pptx")
    
    # Adapt quote dictionary logo path back to filename for PPTX generation test compatibility
    pptx_quote = quote.copy()
    pptx_quote['agencia_logo'] = os.path.join(BASE_DIR, "assets", "Banner letra O.png")
    
    generate_pptx(pptx_quote, pptx_path)
    print(f"PPTX generated successfully at {pptx_path}")


if __name__ == "__main__":
    test_generation()
