# Contexto de la Aplicación: Sistema de Cotizaciones - One Trip Giordano

Este documento proporciona una explicación exhaustiva y detallada de la arquitectura, funcionamiento, lógica interna, flujo de datos y componentes de la aplicación. Está diseñado para servir como referencia de contexto definitiva para desarrolladores o Modelos de Lenguaje (LLMs) que trabajen en el mantenimiento o expansión del sistema.

---

## 1. Propósito del Proyecto

El sistema es una herramienta web interna y premium para la agencia de viajes **One Trip Giordano**. Su objetivo principal es facilitar a los agentes de viajes la creación de cotizaciones profesionales y estéticamente atractivas en formato digital:
1. **Documentos PDF Profesionales**: Archivos descargables tamaño A4 Vertical, diseñados con estética premium, con soporte para hasta 3 opciones de alojamiento y adaptados dinámicamente según la cantidad de opciones cotizadas.
2. **Reimportación de PDF**: Capacidad de arrastrar o cargar un PDF de cotización previamente generado para reconstruir y editar el formulario de forma instantánea mediante la extracción de metadatos incrustados (`/CotizacionData`).

---

## 2. Tecnologías y Librerías Utilizadas

### Backend (Python)
- **FastAPI**: Framework web de alto rendimiento para servir la interfaz estática, administrar la autenticación y procesar las llamadas a la API.
- **Uvicorn**: Servidor ASGI para correr FastAPI.
- **Jinja2**: Motor de plantillas utilizado para inyectar datos dinámicos en el template HTML del PDF.
- **WeasyPrint**: Motor de renderizado que convierte HTML5 y CSS3 en archivos PDF A4 Portrait. Requiere dependencias de sistema de GTK (Cairo, Pango, GdkPixbuf).
- **pypdf**: Librería utilizada para inyectar y extraer metadatos de cotización (`/CotizacionData`) en formato JSON directamente en los archivos PDF generados.
- **Supabase**: Base de datos Postgres en la nube para persistir y almacenar los registros de cotizaciones generadas y los presupuestos rápidos.
- **Python-dotenv**: Carga de variables de entorno desde un archivo `.env` o `.env.local`.

### Frontend (Vanilla JS + HTML5 + CSS)
- **HTML5 & CSS (Tailwind CSS CDN + Estilos personalizados)**: Interfaz de usuario limpia, moderna y completamente adaptable (responsiva) para dispositivos móviles y computadoras.
- **Flatpickr**: Librería ligera y potente para la selección interactiva de fechas.
- **JavaScript (ES6)**: Controla el estado del formulario, realiza cálculos matemáticos complejos en tiempo real y gestiona las llamadas asíncronas de guardado, actualización, visualización y extracción de PDFs.

### Despliegue e Infraestructura
- **Dockerfile (Python Slim + GTK)**: Configuración para levantar la aplicación en plataformas de contenedores (Railway, Render, Fly.io, Hugging Face) asegurando que las dependencias nativas para WeasyPrint (GTK) estén correctamente instaladas en Linux.
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
├── app/
│   ├── main.py                 # Endpoints de la API y configuración de la aplicación
│   ├── database.py             # Integración y persistencia de cotizaciones en Supabase
│   ├── parser.py               # Lector y parseador de archivos Excel y CSV para importaciones rápidas
│   ├── pdf_generator.py        # Generador de PDFs mediante WeasyPrint (renderiza el template de Jinja y usa pypdf para inyectar metadatos)
│   └── routers/
│       ├── auth.py             # Rutas para el control de acceso y manejo de sesiones de agentes/invitados
│       ├── cotizaciones.py     # Endpoints principales de cotizaciones, PDF y extracción
│       └── presupuestos.py     # Endpoints para presupuestos rápidos
├── templates/
│   └── cotizacion_pdf_v2.html  # Plantilla HTML/CSS de la cotización para Weasyprint (A4 Vertical)
├── static/
│   ├── index.html              # Interfaz de usuario principal (Single Page Application)
│   ├── css/
│   │   ├── style.css           # Estilos personalizados adicionales de la UI
│   │   └── styles.css          # Estilos adicionales globales y específicos
│   └── js/
│       ├── main.js             # Enrutamiento del frontend y barra lateral
│       ├── cotizar.js          # Lógica de creación de cotizaciones, cálculos y comunicación API PDF/Supabase
│       ├── cotizacion_rapida.js# Módulo de cotizaciones rápidas (presupuesto estilo hoja de cálculo)
│       ├── inicio.js           # Panel de cotizaciones guardadas (CRUD en frontend)
│       └── login.js            # Lógica de inicio de sesión de agentes e invitados
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
- **Selector de Habitación**: El campo de Habitación incluye un menú desplegable con opciones predefinidas ("Estándar", "Suite", "Vista Mar", "Superior", "Deluxe"), las cuales anteponen automáticamente la palabra "Habitación" (ej. "Habitación Suite"). Al seleccionar "Personalizado", se habilita un campo de texto para ingresar descripciones a medida (ej. "Apartamento Doble", "Cabaña 2 Dormitorios") sin forzar la palabra "Habitación".
- **Dropdown de Régimen**: El campo Régimen posee opciones preestablecidas como "All Inclusive", "Desayuno incluido", "Solo alojamiento", "Media Pension" y "Desayuno y Cena incluidos".
- **Formateo de Nombre del Hotel**: Agrega la palabra "Hotel " al principio si el nombre ingresado no contiene la palabra "hotel" explícitamente y no cuenta con palabras clave que indiquen otro tipo de alojamiento (como *posada*, *departamento*, *depto*, *hostel*, *cabaña*, *villa*, *resort*, etc.).

### E. Módulo de Presupuesto Rápido
- **Carga estilo Hoja de Cálculo**: Permite realizar cotizaciones rápidas basadas exclusivamente en montos numéricos ingresados de forma interactiva (Vuelos, Terrestres e Impuestos). Detecta y normaliza automáticamente al pegar montos formateados con separadores de miles (puntos) y decimales (comas), convirtiéndolos a valores numéricos limpios (ej. `1.250,50` -> `1250.50` o `1.500` -> `1500.00`).
- **Toggle de Redondeo**: Ubicado al lado de la opción "Moneda", permite activar o desactivar el redondeo hacia arriba al múltiplo de 10 más cercano (`Math.ceil(pax / 10) * 10`). Al activarse, se despliegan con animación suave tanto la fila **Redondeo** en el cuerpo de la tabla (justo debajo de Gastos Administrativos, mostrando el diferencial exacto agregado) como la fila **TOTAL REDONDEADO** en el pie de la tabla.
- **Vuelos Dinámicos**: Permite agregar tramos de vuelo ilimitados con inputs para costo base neto y fee, calculando la suma de forma automática en tiempo real.
- **Terrestres Dinámicos**: Permite agregar alojamientos y servicios terrestres ilimitados con inputs para costo neto.
- **Cálculo de Comisión Automática**: Suma el 5% de gastos administrativos sobre el total de servicios terrestres netos de forma inalterable y obligatoria.
- **Flujo Puente de Integración**: Ofrece un botón de "Continuar a Cotización Completa" que almacena el presupuesto rápido para el historial y autocompleta el formulario principal, mapeando y consolidando los montos (vuelos consolidados netos + fee, traslados si el nombre contiene 'traslado', y hoteles secuenciales) dejando las descripciones, estrellas e imágenes en blanco para el enriquecimiento estético por parte del agente.

### F. Importación y Reconstrucción desde PDF (Drag & Drop)
- **Extracción de Metadatos**: El sistema permite arrastrar un archivo de cotización PDF generado previamente directamente sobre la aplicación.
- **Carga Automática**: El backend analiza los metadatos del PDF utilizando la librería `pypdf`, recupera el JSON con el payload de cotización completo y el frontend rellena de forma instantánea el formulario. Esto facilita la edición y actualización rápida de cotizaciones existentes sin recurrir a la base de datos si se tiene el archivo físico.

### G. Configuración: Catálogo de Hoteles (`/configuracion`)
- **Alta y edición de hoteles** por sucursal: nombre, destino, calificación (1 a 5 estrellas), régimen y habitación habituales, descripción (máx. 200 caracteres, mismo límite que el PDF) y hasta 6 fotos (la primera es la portada; se pueden subir, arrastrar o pegar con Ctrl+V y se comprimen a JPEG).
- **Selector "Mis Hoteles"**: cada tarjeta de hotel de la Cotización PDF (estándar y multidestino) tiene un botón que abre el catálogo y completa nombre, categoría, régimen, habitación, descripción e imagen. Si el hotel tiene varias fotos, el agente elige cuál usar. Lógica compartida en `static/js/hotel_catalog.js`.

### G.1. Sección Configuración (`/configuracion`)
Es un panel con opciones, no una única pantalla. El menú muestra una tarjeta por cada herramienta (con el conteo de registros) y al elegir una se abre su panel con un botón para volver:
1. **Catálogo de Hoteles** (ver G).
2. **Catálogo de Aerolíneas** (ver G.3).
3. **Exportar Cotizaciones** (ver G.2).

### G.2. Exportación de Cotizaciones a CSV (Configuración)
- Botón **Descargar CSV** en `/configuracion`: exporta todas las cotizaciones detalladas de la sucursal con una fila por cotización (datos del pasaje, montos, operadores y hasta N columnas de hotel según el máximo encontrado).
- Formato pensado para Excel en español: separador `;`, decimales con coma, fechas `DD/MM/AAAA` y BOM UTF-8 para los acentos.
- **No incluye las fotos**: la columna `hoteles` guarda imágenes en base64 y la tabla pesa cientos de MB, por lo que la extracción se hace en el servidor con la función `exportar_cotizaciones` (ver `scripts/005_exportar_cotizaciones.sql`). Sin ella, un `select *` supera el timeout.

### G.3. Catálogo de Aerolíneas (Configuración)
- Cada aerolínea guarda nombre, código opcional (ej. `AR`) y logo.
- El logo se sube como imagen o se elige entre los incluidos en `assets/logos_aerolineas`, que el backend lista en `GET /api/aerolineas/logos-sugeridos`. Al elegir uno incluido se autocompleta el nombre si está vacío.
- **Uso en Cotizaciones Rápidas**: cada fila de tipo *Vuelo* muestra un chip para elegir la aerolínea; una vez elegida se ve su logo junto al nombre. El dato se guarda en la fila (`aerolinea` y `aerolinea_logo`) y viaja dentro del arreglo `vuelos` de la cotización rápida, por lo que no requiere columnas nuevas.

### I. Operador por Servicio (Cotización Completa)
- Cada servicio cotizado registra con qué **operador mayorista** se consiguió: vuelos, traslados y cada alojamiento por separado.
- Los campos son de texto libre con autocompletado (`<datalist id="operadores-list">`) alimentado por `GET /api/operadores` más los habituales de la agencia (Delfos y Ola).
- La **tabla resumen en tiempo real** muestra un tag de color junto a cada servicio, con la misma paleta que los badges de `getOperatorBadge()` usados en Archivos (Delfos naranja, Ola rosa, resto gris).
- Persistencia: `operador_vuelos` y `operador_traslados` son columnas de `cotizaciones`; el operador de cada hotel viaja dentro del objeto correspondiente de la columna JSONB `hoteles`.

### H. Paquetes Promocionales para Redes (`/paquetes`)
- Se guardan en una tabla propia (`paquetes_promocionales`), **separados de las cotizaciones de pasajeros**.
- Usan la misma fórmula de precios que las cotizaciones (vuelo + fee, terrestre + 5% de gastos administrativos, gastos + IVA), calculada sobre una base de pasajeros (single/doble/triple/cuádruple) para obtener el precio por persona, con redondeo opcional a múltiplos de 10.
- **Financiación en cuotas**: la **entrega** es siempre el valor de los vuelos por persona (monto + fee) y el saldo (`precio por persona - entrega`) se divide en **3 y/o 6 cuotas** (redondeadas hacia arriba al centavo).
- **Salidas para redes**: imagen 1080×1350 generada en el navegador con html2canvas (foto del hotel, logo de la agencia, qué incluye, precio y cuotas) y texto con emojis listo para copiar.

### J. Cotización de Crucero (`/cotizacion-crucero`)
- **Carga desde el PDF del operador**: el agente arrastra el presupuesto que descarga del mayorista (ej. Ola / Krooze) y `app/crucero_parser.py` extrae barco, naviera, cabina y tamaño, noches, fechas de embarque y desembarque, puertos, pasajeros, código, precio, itinerario día por día, foto de la cabina y mapa de la ruta (descarta los logos que se repiten en todas las páginas). Si faltan datos esenciales y hay `GROQ_API_KEY`, se completan con IA sin pisar lo ya detectado. Los campos autocompletados se resaltan en verde para que el agente los revise.
- **Servicios opcionales**: vuelos (capturas, equipaje, fee automático del 10% o fijo), alojamiento pre y post crucero (con selector "Mis Hoteles"), traslados al puerto y paquete de bebidas.
- **Precio único (lógica AND)**: `vuelos + fee + crucero (tarifa + tasas y propinas + bebidas) + alojamientos + traslados + 5% de gastos administrativos sobre los servicios no aéreos`, con redondeo opcional. Se calcula en `_apply_crucero_totals` (backend) y en `static/js/crucero_resumen.js` (resumen en tiempo real).
- **Persistencia**: se guarda en la tabla `cotizaciones` sin columnas nuevas; el bloque `crucero` viaja dentro de la entrada `METADATA_COTIZACION` de `hoteles` (con `tipo_cotizacion: "crucero"`) y cada hotel lleva `etapa: "pre" | "post"`.
- **PDF**: `templates/cotizacion_crucero_pdf.html` (`generate_cruise_pdf`) arma una línea de tiempo vertical con los pasos unidos por líneas punteadas: vuelo de ida → hotel pre → traslado → embarque (cabina, itinerario y mapa) → desembarque → traslado → hotel post → vuelo de regreso, y cierra con la tarjeta del total.

---

## 6. Endpoints de la API (`app/routers/` y `app/main.py`)

### 1. `GET /api/config` & `POST /api/config`
Gestiona la información de marca de la agencia (colores primarios, nombre de la agencia, base64 del logo, etc.). Los datos se guardan localmente en `config/agency_config.json`.

### 2. `POST /api/optimizar-descripcion`
Envía la descripción de un hotel ingresada por el agente a la API de **Groq** utilizando el modelo `mistral-7b-instruct` (con fallbacks automáticos). El prompt instruye a la IA a reescribir la descripción con un estilo enfocado en turismo de lujo y premium en un límite estricto de 60-80 palabras.

### 3. `POST /api/cotizaciones` (GET / POST / DELETE)
Permite el CRUD completo de cotizaciones en la base de datos de Supabase. Detecta automáticamente al agente que realiza la acción mediante su token de sesión. El `POST` realiza un `INSERT` o `UPDATE` dependiendo de si se pasa un ID en el payload.

### 4. `POST /api/presupuestos` (GET / POST / DELETE)
Permite almacenar y gestionar los registros de presupuestos rápidos (módulo rápido) en la tabla `cotizaciones_rapidas` de Supabase. Requiere sesión activa de agente y asocia automáticamente el `agente_id` a la fila de datos.

### 5. `POST /api/importar-excel`
Permite subir un archivo Excel (`.xlsx`) o CSV para pre-cargar datos de múltiples opciones y servicios en la aplicación.

### 6. `POST /api/cotizar-pdf`
Genera el PDF en tiempo real compilando el HTML con WeasyPrint e inyectando las imágenes temporales de los tramos de vuelo y alojamientos. Antes de devolver los bytes, inyecta los datos de cotización en formato JSON como metadatos en la propiedad `/CotizacionData` del PDF.

### 7. `POST /api/extraer-pdf`
Endpoint que procesa un archivo PDF subido por el usuario, extrae la propiedad de metadatos `/CotizacionData` y devuelve el JSON original de la cotización para su reconstrucción en el frontend.

### 8. `/api/hoteles` (GET / POST / PUT / DELETE)
CRUD del catálogo de hoteles en la tabla `hoteles_catalogo`, aislado por `sucursal_id`. El listado devuelve solo la portada (`portada`, `total_fotos`); `GET /api/hoteles/{id}` devuelve todas las fotos.

### 9. `/api/paquetes` (GET / POST / PUT / DELETE, `POST /{id}/duplicar`)
CRUD de paquetes promocionales en la tabla `paquetes_promocionales`, aislado por `sucursal_id`. El formulario completo se guarda en la columna JSONB `data` (incluye `resumen` con entrega y cuotas).

### 10. `GET /api/exportar-cotizaciones-csv`
Devuelve un CSV con todas las cotizaciones detalladas de la sucursal (sin imágenes). Internamente usa la función de Postgres `exportar_cotizaciones`.

### 11. `GET /api/operadores`
Lista los operadores ya usados en la sucursal (columnas `operador_vuelos` y `operador_traslados`) para el autocompletado del formulario.

### 12. `/api/aerolineas` (GET / POST / PUT / DELETE) y `GET /api/aerolineas/logos-sugeridos`
CRUD del catálogo de aerolíneas en la tabla `aerolineas_catalogo`, aislado por `sucursal_id`. El endpoint de logos sugeridos lista los archivos de `assets/logos_aerolineas`.


### 13. `POST /api/crucero/extraer-pdf`
Recibe el PDF del operador (máx. 15 MB) y devuelve los datos del crucero detectados (`campos_detectados` indica cuáles se encontraron). Las cotizaciones de crucero se guardan y generan con los mismos `POST /api/cotizaciones` y `POST /api/cotizar-pdf`.

> Las tablas de hoteles y paquetes se crean con `scripts/003_hoteles_paquetes.sql`;
> las columnas de operador con `scripts/004_operadores.sql`;
> la función de exportación con `scripts/005_exportar_cotizaciones.sql`;
> la tabla de aerolíneas con `scripts/006_aerolineas.sql`.

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
