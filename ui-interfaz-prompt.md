Actuá como un desarrollador Frontend experto en UI/UX moderno y arquitectura de interfaces limpias. Necesito que diseñes la interfaz completa del formulario de carga para nuestro sistema de cotizaciones internas de la agencia de viajes premium "One Trip Giordano".

La interfaz debe combinar de forma estricta una estructura de **Bento Grids** (para organizar la información en módulos independientes) con una estética **Glassmorphism / Glass Minimalist**.

### 1. REGLAS DE DISEÑO VISUAL (CSS / TAILWIND)
- **El Lienzo (Fondo):** Creá un fondo de página utilizando un degradado de malla (mesh gradient) dinámico pero sutil con tonos inspirados en viajes premium (tonos suaves de azul, violeta y lavanda). Esto es mandatorio para que el efecto "glass" funcione sobre el contraste del fondo.
- **Tarjetas Bento (Bento Boxes):** Cada sección del formulario debe ser un contenedor modular e independiente con las siguientes propiedades de vidrio:
  - `background: rgba(255, 255, 255, 0.4);` (o equivalente en Tailwind `bg-white/40`)
  - `backdrop-filter: blur(15px) saturate(180%);`
  - `border: 1px solid rgba(255, 255, 255, 0.25);`
  - `border-radius: 16px;` a `24px;`
  - `box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.05);`
- **Inputs y Controles Internos:** Los campos de texto, selectores y zonas de carga deben acoplarse a la estética:
  - Sin bordes nativos toscos, bordes finos semitransparentes.
  - Al hacer `:focus`, el borde debe iluminarse suavemente con una transición CSS (`transition: all 0.3s ease`).
  - Mucho padding interno (`gap` y `padding` amplios) para mantener la filosofía minimalista y limpia; la información no debe estar amontonada.
- **Tipografía:** Usá la fuente sans-serif 'Montserrat' (fuente oficial de la agencia) con una jerarquía de pesos impecable.

### 2. ARQUITECTURA DEL FORMULARIO (Estructura Bento Grid)
Organizá la pantalla en un layout asimétrico de rejilla (Grid) donde convivan las siguientes secciones de datos de nuestro backend:

- **Módulo A (Cabecera General):** Datos básicos de la cotización (Nombre del pasajero, destino, cantidad de pasajeros).
- **Módulo B (Sección Aérea):** Inputs para Vuelo Neto (`monto_vuelos`), y el selector de Fee Aéreo (`fee_aereo`) que permita alternar entre cálculo automático (10% del neto) o un monto fijo manual.
- **Módulo C (Bloques de Opciones de Hoteles - Las 3 opciones):** Diseñá un layout dinámico (pueden ser pestañas o sub-tarjetas bento contiguas) para cargar las 3 opciones de hoteles disponibles. Cada una requiere:
  - Nombre del hotel y estrellas (con badge estético).
  - Costo neto del hotel (`costo_hotel`).
  - Monto de traslados (`monto_traslados`).
  - Campo de descripción corta con un botón moderno al lado que diga "Optimizar con IA" (este botón dispara nuestro endpoint `/api/optimizar-descripcion`).
  - Badges de servicios seleccionables (Noches, Régimen de comida, Tipo de habitación).
- **Módulo D (Carga Multimedia - Drag & Drop):** Una zona bento minimalista con bordes punteados muy sutiles para arrastrar y soltar imágenes base64 de los vuelos y hoteles.
- **Módulo E (Cálculos en Tiempo Real y Acciones):** Un bloque destacado que muestre de forma limpia cómo se compone el precio final de cada opción a medida que el agente escribe, aplicando de forma estricta nuestras fórmulas de negocio:
  - `Gastos Administrativos (5% obligatorio e inalterable sobre la suma de Costo Hotel + Monto Traslados)`.
  - Suma de Gastos + IVA (`gastos_iva`).
  - Costo Total de la opción y el Precio por Persona (`Costo Total / Cantidad de Pasajeros`).
- **Módulo F (Botones de Disparo):** Dos botones de acción principales e imponentes: "Generar Google Slides" (apunta a `/api/cotizar`) y "Descargar PDF A4" (apunta a `/api/cotizar-pdf`).

### 3. ENTREGABLE REQUERIDO
Proporcioname el código HTML5 estructurado semánticamente y los estilos CSS (o clases de Tailwind CSS) necesarios para renderizar esta interfaz. El código debe incluir la distribución de columnas y filas de la Bento Grid, las clases del efecto Glassmorphism y la estructura para los campos de texto, fechas, montos e imágenes.