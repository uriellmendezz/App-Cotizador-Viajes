# Contexto del Proyecto: Sistema de Cotizaciones - One Trip Giordano

Este documento proporciona una explicación detallada de la arquitectura, funcionamiento, lógica interna y componentes de la aplicación. Está diseñado para servir como referencia de contexto para desarrolladores o Modelos de Lenguaje (LLMs) que trabajen en el mantenimiento o expansión del sistema.

---

## 1. Propósito del Proyecto
El sistema es una herramienta interna para la agencia de viajes premium **One Trip Giordano**. Su objetivo principal es facilitar a los agentes de viajes la creación de cotizaciones profesionales y atractivas en dos formatos:
1. **Presentaciones en Google Slides**: Diapositivas dinámicas creadas mediante copia de plantillas en la nube.
2. **Documentos PDF Profesionales**: Archivos descargables tamaño A4 Vertical, diseñados con estética premium, listos para enviar a los clientes.

---

## 2. Tecnologías y Librerías Utilizadas

### Backend (Python)
- **FastAPI**: Framework web para servir la interfaz estática y procesar las llamadas a la API.
- **Uvicorn**: Servidor ASGI para correr FastAPI.
- **Jinja2**: Motor de plantillas utilizado para inyectar datos dinámicos en el template HTML del PDF.
- **WeasyPrint**: Motor de renderizado que convierte HTML5 y CSS3 en archivos PDF A4 Portrait. Requiere dependencias de sistema de GTK (Cairo, Pango, GdkPixbuf).
- **Google API Client (`google-auth`, `google-api-python-client`)**: SDK para interactuar con Google Slides y Google Drive APIs.
- **Supabase**: Base de datos Postgres en la nube para persistir y almacenar los registros de cotizaciones generadas.
- **Python-PPTX**: Generación local y manipulación de archivos PowerPoint (.pptx).
- **Python-dotenv**: Carga de variables de entorno desde un archivo `.env`.

### Frontend (Vanilla JS + HTML5 + CSS)
- **HTML5 & CSS (Tailwind CSS)**: Interfaz de usuario limpia, moderna y responsiva.
- **JavaScript (ES6)**: Controla el estado del formulario, realiza los cálculos matemáticos en tiempo real y gestiona las llamadas asíncronas a la API del servidor.

### Despliegue e Infraestructura
- **Dockerfile (Python Slim + GTK)**: Configuración para levantar la aplicación en plataformas de contenedores (Railway, Render, Fly.io) asegurando que las dependencias nativas para WeasyPrint (GTK) estén correctamente instaladas en Linux.
- **Vercel Config (`vercel.json`)**: Configuración para hosting serverless tradicional (Nota: WeasyPrint requiere librerías compartidas de GTK que no están disponibles nativamente en AWS Lambda de Vercel, por lo que se prefiere el despliegue Docker).

---

## 3. Arquitectura del Proyecto

### Estructura del Directorio
```text
├── .gitignore                  # Lista de exclusiones de Git (Ignora credenciales y tokens)
├── Dockerfile                  # Contenedor de producción con librerías GTK para WeasyPrint
├── requirements.txt            # Dependencias del backend de Python
├── vercel.json                 # Configuración de despliegue en Vercel
├── app.py                      # Punto de entrada para levantar la aplicación localmente
├── estructura-v3.json          # Archivo de estructura para la plantilla de Google Slides
├── app/
│   ├── main.py                 # Endpoints de la API y lógica de negocio principal
│   ├── database.py             # Integración y persistencia de cotizaciones en Supabase
│   ├── parser.py               # Lector y parseador de archivos Excel y CSV
│   ├── pdf_generator.py        # Generador de PDFs mediante WeasyPrint (renderiza el template de Jinja)
│   └── google_slides/
│       ├── generator.py        # Creador de presentaciones en Google Slides desde cero
│       ├── mcp.py              # Creador de presentaciones en Google Slides usando copias de plantillas
│       ├── exporter.py         # Script utilitario para exportar estructuras JSON de Slides
│       └── pptx_generator.py   # Generador local de archivos PPTX
├── templates/
│   └── cotizacion_pdf_v2.html  # Plantilla HTML/CSS de la cotización para Weasyprint (A4 Vertical)
├── static/
│   ├── index.html              # Interfaz de usuario principal (Formulario del agente)
│   ├── css/
│   │   └── style.css           # Estilos personalizados adicionales de la UI
│   └── js/
│       └── main.js             # Lógica del frontend (cálculos en tiempo real y comunicación API)
├── Montserrat/                 # Directorio de fuentes tipográficas oficiales en formato .ttf
└── assets/                     # Banners institucionales e iconos SVG de servicios del PDF
```

---

## 4. Lógica de Negocio y Flujo de Datos

### A. Lógica de Precios y Fórmulas
La aplicación realiza un cálculo financiero estricto sobre los servicios ingresados. El flujo calcula el total y el costo por persona de la siguiente forma:

1. **Vuelo Neto (`monto_vuelos`)**: Costo base de los pasajes de avión.
2. **Fee Aéreo (`fee_aereo`)**:
   - **Automático**: Es el 10% del Vuelo Neto (`monto_vuelos * 0.10`).
   - **Fijo**: Un monto manual ingresado por el agente.
3. **Costo Total Aéreo**: `monto_vuelos + fee_aereo`.
4. **Costo Terrestre**: `costo_hotel` (Costo neto del hotel) + `monto_traslados` (Traslados de llegada y salida).
5. **Gastos Administrativos (Fee de Agencia)**: Se añade de forma obligatoria e inalterable un **5%** sobre la suma de los servicios terrestres:
   $$\text{Gastos Admin} = (\text{Costo Hotel} + \text{Monto Traslados}) \times 0.05$$
6. **Gastos + IVA (`gastos_iva`)**: Impuestos y tasas manuales adicionales.
7. **Costo Total de la Opción**:
   $$\text{Costo Total} = \text{Costo Total Aéreo} + \text{Costo Terrestre} + \text{Gastos Admin} + \text{Gastos + IVA}$$
8. **Precio por Persona (Precio Pax)**: El total dividido por la cantidad de pasajeros (`cantidad_pasajeros`):
   $$\text{Precio Persona} = \frac{\text{Costo Total}}{\text{Cantidad de Pasajeros}}$$

*(Nota: En la interfaz del agente, al ingresar estos datos, la aplicación calcula estos valores de forma independiente para cada una de las 3 opciones de hoteles posibles).*

---

## 5. Funcionamiento de los Endpoints de la API (`app/main.py`)

### 1. `GET /api/config` & `POST /api/config`
Gestiona la información de marca de la agencia (colores primarios, nombre de la agencia, base64 del banner y los IDs de carpetas/plantillas de Google Slides). Los datos se guardan localmente en `config/agency_config.json`.

### 2. `POST /api/optimizar-descripcion`
Envía la descripción de un hotel ingresada por el agente a la API de **Groq** utilizando el modelo `mistral-7b-instruct` (con fallbacks automáticos a `llama-3.3-70b` o `llama-3.1-8b`). El prompt instruye a la IA a reescribir la descripción con un estilo enfocado en turismo de lujo y premium en un límite estricto de 60-80 palabras.

### 3. `POST /api/cotizar`
Genera una presentación en Google Slides:
- Recibe los datos de la cotización y los hoteles seleccionados.
- Realiza las llamadas de autenticación del API de Google Drive/Slides (usando variables de entorno o archivos JSON locales).
- Copia una presentación plantilla de Slides existente y reemplaza las variables dinámicas (del tipo `<<PASAJERO>>`, `<<DESTINO>>`) mediante peticiones por lotes (`batchUpdate`).
- Guarda la información en la base de datos de Supabase.
- Devuelve la URL de edición del Google Slide generado.

### 4. `POST /api/cotizar-pdf`
Genera y descarga el PDF en tiempo real:
- Recibe los mismos datos del formulario.
- Ejecuta los cálculos financieros para cada opción de hotel.
- Decodifica las imágenes base64 de vuelos y hoteles y las guarda en archivos temporales en el servidor.
- Inyecta la información en la plantilla `templates/cotizacion_pdf_v2.html`.
- Usa WeasyPrint para compilar el HTML, aplicar los estilos A4 y generar el PDF binario.
- Limpia los archivos temporales y responde con un stream del archivo PDF.

---

## 6. Detalles de la Plantilla de PDF (`cotizacion_pdf_v2.html`)

El archivo de plantilla PDF incluye detalles específicos de estilo bajo los requerimientos de la marca:

- **Configuración de Página (Paged Media)**: Configurado a tamaño A4 con orientación vertical, márgenes específicos y numeración de página dinámica en la esquina inferior derecha (`@page { size: A4 portrait; margin: 10mm 15mm; }`).
- **Tipografía Montserrat**: Se carga mediante `@font-face` referenciando archivos locales `.ttf` (desde `Montserrat/static/`).
- **Ficha "Nuestra Recomendación"**: Se muestra exclusivamente en la primera opción de hotel de la lista, y **únicamente** si se ha cotizado más de un hotel en la propuesta.
- **Badges de Servicio**: Los datos de noches, régimen de comida, tipo de habitación y las estrellas del hotel están agrupados visualmente en pequeñas cajas o recuadros (`.hotel-svc-badge`). En el caso de las estrellas, se muestra el texto descriptivo (ej: `4 estrellas`) acompañado de caracteres estrella coloreados en amarillo (`#f7bd46`).
- **Control de superposición**: La descripción corta del hotel está limitada a un ancho máximo (`max-width: 72%`) para garantizar que nunca se sobreponga visualmente con el bloque de precios ubicado en la esquina inferior derecha de la tarjeta.
- **Pie de Página Fijo (Legales)**: La sección de textos legales obligatorios está fijada en la parte inferior de la hoja mediante `position: fixed; bottom: 10px;` asegurando que siempre se posicione sobre el límite inferior de la página.
