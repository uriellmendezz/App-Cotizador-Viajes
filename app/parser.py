import os
import csv
from datetime import datetime
import openpyxl

def parse_excel_or_csv(file_path):
    """
    Parses an Excel (.xlsx) or CSV file containing quotes data,
    maps headers, and calculates missing values based on the financial model.
    """
    ext = os.path.splitext(file_path)[1].lower()
    rows = []
    
    if ext == '.xlsx':
        wb = openpyxl.load_workbook(file_path, data_only=True)
        sheet = wb.active
        
        # Extract headers from the first row
        headers = [str(cell.value).strip().lower() if cell.value is not None else "" for cell in sheet[1]]
        
        # Read subsequent rows
        for row in list(sheet.iter_rows(min_row=2, values_only=True)):
            if not any(row):  # Skip completely empty rows
                continue
            row_dict = {}
            for idx, cell_val in enumerate(row):
                if idx < len(headers) and headers[idx]:
                    row_dict[headers[idx]] = cell_val
            rows.append(row_dict)
            
    elif ext == '.csv':
        try:
            with open(file_path, mode='r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # clean keys and values
                    clean_row = {k.strip().lower(): v for k, v in row.items() if k is not None}
                    rows.append(clean_row)
        except UnicodeDecodeError:
            # fallback to latin-1 if utf-8 fails
            with open(file_path, mode='r', encoding='latin-1') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    clean_row = {k.strip().lower(): v for k, v in row.items() if k is not None}
                    rows.append(clean_row)
    else:
        raise ValueError(f"Extensión de archivo no soportada: {ext}")
        
    return process_raw_rows(rows)

def format_hotel_name(name: str) -> str:
    if not name:
        return ""
    name_stripped = name.strip()
    if not name_stripped:
        return ""
    
    lower_name = name_stripped.lower()
    has_hotel = "hotel" in lower_name
    
    non_hotel_keywords = [
        "posada", "departamento", "depto", "hostel", "cabaña", "cabana", 
        "cabañas", "cabanas", "loft", "villa", "casa", "hosteria", "hostería", 
        "motel", "resort", "apart", "apartamento"
    ]
    has_non_hotel = any(kw in lower_name for kw in non_hotel_keywords)
    
    if not has_hotel and not has_non_hotel:
        return "Hotel " + name_stripped
    return name_stripped

def normalize_float(val, default=0.0):
    if val is None or val == "":
        return default
    if isinstance(val, (int, float)):
        return float(val)
    try:
        # handle string representations, e.g., $1.200,50 or 1,200.50
        s = str(val).strip().replace('$', '').replace(' ', '')
        if ',' in s and '.' in s:
            # check which format: European or US
            if s.find('.') < s.find(','):
                s = s.replace('.', '').replace(',', '.')
            else:
                s = s.replace(',', '')
        elif ',' in s:
            # check if comma is decimal separator (e.g. 1000,50)
            # count if there's only one comma and length of suffix is 2 or 1
            if len(s.split(',')[1]) <= 2:
                s = s.replace(',', '.')
            else:
                s = s.replace(',', '')
        return float(s)
    except Exception:
        return default

def normalize_int(val, default=1):
    if val is None or val == "":
        return default
    if isinstance(val, int):
        return val
    try:
        return int(normalize_float(val))
    except Exception:
        return default

def normalize_date(val):
    if isinstance(val, datetime):
        return val.strftime("%d/%m/%Y")
    if val is None:
        return ""
    s = str(val).strip()
    # Try parsing various formats
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return s

def process_raw_rows(raw_rows):
    processed_quotes = []
    
    # Standard header aliases mapping
    mapping = {
        'nombre_pax': ['pasajero', 'nombre', 'nombre pasajero', 'pax', 'client', 'cliente', 'nombre_pax'],
        'destino': ['destino', 'destino viaje', 'destination'],
        'fecha_salida': ['fecha salida', 'fecha_salida', 'salida', 'date', 'fecha'],
        'monto_vuelos': ['vuelos', 'monto vuelos', 'monto_vuelos', 'vuelo', 'aereo', 'precio vuelos'],
        'fee_aereo_percent': ['fee %', 'fee aereo %', 'porcentaje fee', 'porcentaje_fee_aereo', 'fee_percent', 'fee'],
        'monto_alojamiento': ['alojamiento', 'monto alojamiento', 'monto_alojamiento', 'hotel costo', 'costo hotel', 'precio hotel'],
        'monto_traslados': ['traslados', 'monto traslados', 'monto_traslados', 'traslado', 'transfer'],
        'gastos_iva': ['gastos iva', 'gastos_iva', 'iva', 'tasas', 'gastos', 'gastos_administrativos_e_iva'],
        'cantidad_pasajeros': ['cantidad pasajeros', 'cantidad_pasajeros', 'pax_count', 'pasajeros', 'cant_pax'],
        'origen': ['origen', 'salida desde', 'origen viaje', 'desde'],
        'fecha_vuelo_ida': ['fecha vuelo ida', 'fecha_vuelo_ida', 'ida fecha', 'salida ida'],
        'fecha_vuelo_vuelta': ['fecha vuelo vuelta', 'fecha_vuelo_vuelta', 'vuelta fecha', 'regreso fecha'],
        'hotel_nombre': ['hotel', 'hotel nombre', 'hotel_nombre', 'nombre hotel', 'establecimiento'],
        'hotel_descripcion': ['hotel descripcion', 'hotel_descripcion', 'descripcion', 'descripcion hotel'],
        'hotel_estrellas': ['estrellas', 'hotel estrellas', 'categoria', 'stars'],
        'hotel_regimen': ['regimen', 'hotel regimen', 'regimen comidas', 'board', 'pension'],
        'hotel_habitacion': ['habitacion', 'hotel habitacion', 'tipo habitacion', 'room'],
    }
    
    for row in raw_rows:
        mapped = {}
        for key, aliases in mapping.items():
            mapped[key] = None
            for alias in aliases:
                if alias in row:
                    mapped[key] = row[alias]
                    break
        
        # Financial input defaults & normalization
        cant_pax = normalize_int(mapped['cantidad_pasajeros'], default=1)
        monto_vuelos = normalize_float(mapped['monto_vuelos'], default=0.0)
        fee_aereo_percent = normalize_float(mapped['fee_aereo_percent'], default=10.0)
        monto_alojamiento = normalize_float(mapped['monto_alojamiento'], default=0.0)
        monto_traslados = normalize_float(mapped['monto_traslados'], default=0.0)
        gastos_iva = normalize_float(mapped['gastos_iva'], default=0.0)
        
        # Calculate derived metrics based on Module 3 formulas
        fee_aereo = monto_vuelos * (fee_aereo_percent / 100.0)
        gastos_admin = (monto_alojamiento + monto_traslados) * 0.05
        costo_total = (monto_vuelos + fee_aereo) + monto_alojamiento + monto_traslados + gastos_admin + gastos_iva
        precio_persona = costo_total / cant_pax if cant_pax > 0 else costo_total
        
        # Room base label determination
        base_habitacion = "Single"
        if cant_pax == 2:
            base_habitacion = "Doble"
        elif cant_pax == 3:
            base_habitacion = "Triple"
        elif cant_pax == 4:
            base_habitacion = "Cuádruple"
        elif cant_pax > 4:
            base_habitacion = "Grupal"
            
        processed_quotes.append({
            'nombre_pax': str(mapped['nombre_pax'] or "Pasajero Sin Nombre").strip(),
            'destino': str(mapped['destino'] or "Destino").strip(),
            'fecha_salida': normalize_date(mapped['fecha_salida']),
            'cantidad_pasajeros': cant_pax,
            'origen': str(mapped['origen'] or "Córdoba").strip(),
            'monto_vuelos': monto_vuelos,
            'fee_aereo_percent': fee_aereo_percent,
            'fee_aereo': fee_aereo,
            'monto_alojamiento': monto_alojamiento,
            'monto_traslados': monto_traslados,
            'gastos_admin': gastos_admin,
            'gastos_iva': gastos_iva,
            'costo_total': round(costo_total, 2),
            'precio_persona': round(precio_persona, 2),
            'base_habitacion': base_habitacion,
            'fecha_vuelo_ida': normalize_date(mapped['fecha_vuelo_ida']),
            'fecha_vuelo_vuelta': normalize_date(mapped['fecha_vuelo_vuelta']),
            'hotel_nombre': format_hotel_name(str(mapped['hotel_nombre'] or "Hotel Seleccionado").strip()),
            'hotel_descripcion': str(mapped['hotel_descripcion'] or "").strip(),
            'hotel_estrellas': str(mapped['hotel_estrellas'] or "4").strip(),
            'hotel_regimen': str(mapped['hotel_regimen'] or "Desayuno").strip(),
            'hotel_habitacion': str(mapped['hotel_habitacion'] or "Estándar").strip(),
        })
        
    return processed_quotes
