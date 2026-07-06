# Contexto del Proyecto: Sistema de Cotizaciones - One Trip Giordano

Este documento proporciona una explicación exhaustiva y detallada de la arquitectura, funcionamiento, lógica interna, flujo de datos y componentes de la aplicación. Está diseñado para servir como referencia de contexto definitiva para desarrolladores o Modelos de Lenguaje (LLMs) que trabajen en el mantenimiento o expansión del sistema.

---

## 1. Propósito del Proyecto

El sistema es una herramienta web interna y premium para la agencia de viajes **One Trip Giordano**. Su objetivo principal es facilitar a los agentes de viajes la creación de cotizaciones profesionales y estéticamente atractivas en dos formatos:
1. **Presentaciones en Google Slides**: Diapositivas dinámicas creadas mediante copia de plantillas en la nube.
2. **Documentos PDF Profesionales**: Archivos descargables tamaño A4 Vertical, diseñados con estética premium y adaptados dinámicamente según la cantidad de opciones cotizadas.

---

## 2. Tecnologías y Librerías Utilizadas

### Backend (Python)
- **FastAPI**: Framework web de alto rendimiento para servir la interfaz estática, administrar la autenticación y procesar las llamadas a la API.
- **Uvicorn**: Servidor ASGI para correr FastAPI.
- **Jinja2**: Motor de plantillas utilizado para inyectar datos dinámicos en el template HTML del PDF.
- **WeasyPrint**: Motor de renderizado que convierte HTML5 y CSS3 en archivos PDF A4 Portrait. Requiere dependencias de sistema de GTK (Cairo, Pango, GdkPixbuf).
- **Google API Client (`google-auth`, `google-api-python-client`)**: SDK para interactuar con Google Slides y Google Drive APIs.
- **Supabase**: Base de datos Postgres en la nube para persistir y almacenar los registros de cotizaciones generadas.
- **Python-PPTX**: Generación local y manipulación de archivos PowerPoint (.pptx).
- **Python-dotenv**: Carga de variables de entorno desde un archivo `.env` o `.env.local`.

### Frontend (Vanilla JS + HTML5 + CSS)
- **HTML5 & CSS (Tailwind CSS)**: Interfaz de usuario limpia, moderna y completamente adaptable (responsiva) para dispositivos móviles y computadoras.
- **JavaScript (ES6)**: Controla el estado del formulario, realiza cálculos matemáticos complejos en tiempo real y gestiona las llamadas asíncronas de guardado, actualización y visualización.

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
6. **Gastos + IVA (`gastos_iva`)**: Impuestos y tasas manuales adicionales (por defecto, $0.00).
7. **Costo Total de la Opción**:
   $$\text{Costo Total} = \text{Costo Total Aéreo} + \text{Costo Terrestre} + \text{Gastos Admin} + \text{Gastos + IVA}$$
8. **Precio por Persona (Precio Pax)**: El total dividido por la cantidad de pasajeros (`cantidad_pasajeros`):
   $$\text{Precio Persona} = \frac{\text{Costo Total}}{\text{Cantidad de Pasajeros}}$$

*(Nota: En la interfaz del agente, al ingresar estos datos, la aplicación calcula estos valores de forma independiente para cada una de las 3 opciones de hoteles posibles).*

### B. Corrección de la Duplicación de Costos de Hotel al Editar
Dado que el backend procesa el costo del hotel calculando el total acumulado y reemplazando temporalmente la propiedad `costo` para que el renderizador de PDF imprima el total del paquete, las ediciones consecutivas duplicaban el valor de los vuelos y traslados. Para resolver esto:
1. El backend almacena el costo neto original en la propiedad `costo_neto` dentro de cada objeto de la lista `hoteles`.
2. Al cargar una cotización en el frontend, se comprueba si posee `costo_neto`. Si está ausente (registros antiguos), se aplica la siguiente fórmula de reconstrucción matemática para despejar el costo neto:
   $$\text{Costo Neto Hotel} = \frac{\text{Costo Total} - \text{Total Aéreo} - 1.05 \times \text{Monto Traslados} - \text{Gastos IVA}}{1.05}$$
3. El frontend inicializa el formulario siempre con este costo neto, eliminando cualquier duplicación de precios al guardar cambios.

---

## 5. Funcionalidades Detalladas de la Aplicación

### A. Autenticación y Control de Sesión
- **Pantalla de Login**: Requiere credenciales de acceso. Dispone de un botón con ícono de "ojo" para alternar la visibilidad de la contraseña.
- **Sesión Activa**: Al recargar la aplicación, se detecta de forma automática si existe un token en memoria o almacenamiento local y ofrece un prompt dinámico ("Continuar en la sesión de [Agente]").
- **Modo Invitado ("guest")**: Permite el ingreso con privilegios limitados. En este modo se ocultan las secciones de cotizaciones guardadas, configuración y datos de prueba. El botón principal se deshabilita y muestra "GENERAR COTIZACIÓN (Solo Agentes)".
- **Indicador de Usuario**: Un recuadro minimalista y limpio al costado derecho del logo muestra el nombre del agente con la sesión iniciada o la palabra "Invitado".
- **Asignación Automática de Agente**: La aplicación detecta en qué sesión se está generando la cotización y la asocia al agente automáticamente al guardar, eliminando la necesidad de seleccionarlo manualmente en el formulario.

### B. Panel de Cotizaciones Guardadas
- **Visualización en Tabla**: Muestra la lista de cotizaciones existentes con columnas para "Fecha creado", "Pasajero", "Destino", "Agente" y "Costo Total".
- **Límites y Orden**: Muestra un máximo de 10 registros, ordenados de forma descendente (más recientes a más antiguos).
- **Barra de Búsqueda**: Permite buscar de manera interactiva por el nombre del pasajero o destino del viaje.
- **Interacciones Visuales**: Las filas del listado muestran un hover sutil y transparente en tono rosa clarito.
- **Opciones de Fila**:
  - **Ver**: Carga la cotización en el formulario en modo de solo lectura (deshabilitando campos) y autogenera la previsualización PDF mostrando un overlay de carga "Mostrando cotización para [Pasajero]".
  - **Duplicar como Nueva**: Habilita los campos asignando un nuevo ID para que la cotización funcione como plantilla de una nueva.
  - **Eliminar**: Elimina el registro de la base de datos tras confirmar la acción.

### C. Modos del Formulario (Creación vs. Edición)
- **Modo Creación (Nueva Cotización)**: El formulario está libre, limpio y el botón principal muestra "GENERAR COTIZACIÓN".
- **Modo Edición**: Al hacer clic en "Editar Cotización" desde una vista guardada, se habilitan los campos y el botón principal cambia a **"GUARDAR COTIZACIÓN"**. Al presionarlo, realiza un `UPDATE` en la base de datos, muestra una alerta de éxito y recarga el listado del panel lateral.

### D. Ayuda y Reglas del Formulario
- **Logos de Ayuda (Tooltip)**: Los campos de "Validez Cotización", "Origen" y "Habitación" poseen un icono de ayuda interactivo que muestra una explicación en hover.
- **Normalización de Habitación**: Si el agente coloca en la celda de alojamiento opciones como "doble" o "simple" sin la palabra "Habitación", el sistema automáticamente antepone "Habitación " (ej. "Habitación Doble").
- **Dropdown de Régimen**: El campo Régimen posee opciones preestablecidas como "All Inclusive", "Desayuno incluido", "Solo alojamiento", "Media Pension" y "Desayuno y Cena incluidos".
- **Formateo de Nombre del Hotel**: Agrega la palabra "Hotel " al principio si el nombre ingresado no contiene la palabra "hotel" explícitamente y no cuenta con palabras clave que indiquen otro tipo de alojamiento (como *posada*, *departamento*, *depto*, *hostel*, *cabaña*, *villa*, *resort*, etc.).

### E. Módulo de Presupuesto Rápido
- **Carga estilo Hoja de Cálculo**: Permite realizar cotizaciones rápidas basadas exclusivamente en montos numéricos ingresados de forma interactiva (Vuelos, Terrestres e Impuestos).
- **Vuelos Dinámicos**: Permite agregar tramos de vuelo ilimitados con inputs para costo base neto y fee, calculando la suma de forma automática en tiempo real.
- **Terrestres Dinámicos**: Permite agregar alojamientos y servicios terrestres ilimitados con inputs para costo neto.
- **Cálculo de Comisión Automática**: Suma el 5% de gastos administrativos sobre el total de servicios terrestres netos de forma inalterable y obligatoria.
- **Flujo Puente de Integración**: Ofrece un botón de "Continuar a Cotización Completa" que almacena el presupuesto rápido para el historial y autocompleta el formulario principal, mapeando y consolidando los montos (vuelos consolidados netos + fee, traslados si el nombre contiene 'traslado', y hoteles secuenciales) dejando las descripciones, estrellas e imágenes en blanco para el enriquecimiento estético por parte del agente.

---

## 6. Endpoints de la API (`app/main.py`)

### 1. `GET /api/config` & `POST /api/config`
Gestiona la información de marca de la agencia (colores primarios, nombre de la agencia, base64 del banner y los IDs de carpetas/plantillas de Google Slides). Los datos se guardan localmente en `config/agency_config.json`.

### 2. `POST /api/optimizar-descripcion`
Envía la descripción de un hotel ingresada por el agente a la API de **Groq** utilizando el modelo `mistral-7b-instruct` (con fallbacks automáticos). El prompt instruye a la IA a reescribir la descripción con un estilo enfocado en turismo de lujo y premium en un límite estricto de 60-80 palabras.

### 3. `POST /api/cotizaciones`
Guarda o actualiza una cotización en Supabase. Si el payload contiene un ID, realiza un `UPDATE` en la fila coincidente, de lo contrario realiza un `INSERT` de un nuevo registro. Detecta de forma automática el agente activo a través de la sesión.

### 4. `POST /api/cotizaciones-rapidas`
Almacena un registro de presupuesto rápido con tramos de vuelo y servicios de hotel en formato JSONB en la tabla `cotizaciones_rapidas` de Supabase. Requiere sesión activa de agente y asocia automáticamente el `agente_id` a la fila de datos.

### 5. `POST /api/cotizar`
Genera una presentación en Google Slides:
- Copia una presentación plantilla de Slides existente y reemplaza las variables dinámicas (del tipo `<<PASAJERO>>`, `<<DESTINO>>`) mediante peticiones por lotes (`batchUpdate`).
- Devuelve la URL de edición del Google Slide generado.

### 6. `POST /api/cotizar-pdf`
Genera y descarga el PDF en tiempo real compilando el HTML con WeasyPrint e inyectando las imágenes temporales de los tramos de vuelo y alojamientos.

---

## 7. Detalles de la Plantilla de PDF (`cotizacion_pdf_v2.html`)

- **Configuración de Página**: Configurado a tamaño A4 con orientación vertical, márgenes específicos y numeración de página dinámica en la esquina inferior derecha.
- **Tipografía Montserrat**: Cargada mediante archivos locales `.ttf` para garantizar consistencia sin depender de internet.
- **Ficha "Nuestra Recomendación"**: Se muestra en la primera opción de hotel y **únicamente** si se ha cotizado más de un hotel en la propuesta.
- **Adaptabilidad a Un Solo Alojamiento (Optimización de Vuelos)**:
  - Cuando la cotización cuenta con **un único hotel** cotizado y **dos vuelos** (salida y regreso), los vuelos se renderizan uno arriba del otro (2 filas, 1 columna) en lugar de lado a lado (2 columnas, 1 fila). Esto optimiza el espacio y elimina espacios en blanco innecesarios en la hoja.
  - Para cotizaciones con múltiples hoteles, las imágenes de los vuelos permanecen en dos columnas normales.
- **Badges de Servicio**: Muestra categorías, régimen y estrellas del hotel de manera gráfica. En el caso de las estrellas, renderiza caracteres de estrella amarillos (`★`, `☆`) acordes a la categoría seleccionada en el formulario.
- **Control de superposición**: La descripción corta del hotel está limitada a un ancho máximo (`max-width: 72%`) para garantizar que nunca se superponga con el bloque de precios en la esquina inferior derecha.

