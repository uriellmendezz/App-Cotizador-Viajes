# Guía de Seguridad, Subida a GitHub y Despliegue en la Nube

¡Felicidades por dar el paso para desplegar tu aplicación! Llevar tu sistema de cotizaciones a la web para que cualquiera pueda usarlo es una excelente decisión. Sin embargo, para hacerlo de manera profesional y segura, es fundamental proteger tus credenciales y estructurar el despliegue de forma correcta.

Esta guía te explicará todo lo que necesitas saber y hacer, paso a paso.

---

## 1. Seguridad Primero: El archivo `.gitignore`

Cuando subes un proyecto a GitHub, **nunca** debes subir claves de API, contraseñas, credenciales de Google ni archivos del entorno de desarrollo. Si lo haces, robots automatizados podrían escanear tu repositorio público en segundos, robar tus claves de Google o Supabase y causar cargos no deseados o hackeos de cuentas.

Para evitar esto, se utiliza el archivo `.gitignore`. Le dice a Git exactamente qué archivos y carpetas debe ignorar por completo.

> [!IMPORTANT]
> **Acción Proactiva Realizada:** He configurado y guardado un archivo `.gitignore` ultra seguro y completo en la raíz de tu proyecto. Ya no correrás el riesgo de subir accidentalmente tus claves o archivos temporales.

### ¿Qué archivos estamos ocultando y por qué?

*   **`.env`**: Contiene tus credenciales locales (claves de Supabase, puertos, etc.). En producción, estas claves se cargan de otra forma.
*   **`credentials.json`**: Contiene tus credenciales de cliente OAuth de Google. **Es extremadamente sensible.**
*   **`token.json`**: Contiene el token de acceso activo a tu cuenta de Google. Si alguien lo obtiene, **tendrá acceso total a tus Google Slides y Google Drive**.
*   **`env/` (o carpetas de entorno virtual)**: Contiene miles de archivos de las librerías de Python instaladas localmente. No deben subirse porque en el servidor se instalarán limpiamente desde `requirements.txt`.
*   **`__pycache__/`**: Archivos temporales compilados por Python que no tienen utilidad en el servidor.

---

## 2. ¿Cómo se manejan las API Keys y Credenciales en el Servidor (Despliegue)?

Dado que no subiremos los archivos `.env`, `credentials.json` ni `token.json` a GitHub, ¿cómo sabrá la aplicación en la nube cuáles son tus credenciales?

La respuesta estándar en la industria son las **Variables de Entorno (Environment Variables)**.

### A. Para variables simples (Supabase, URLs, etc.)
En lugar de leer un archivo `.env`, tu código de Python buscará estas variables directamente en el sistema operativo del servidor utilizando la librería `os`:

```python
import os

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
```

En la plataforma donde hospedes tu app (como **Render** o **Railway**), verás una pestaña llamada **Environment Variables** o **Config Vars**. Allí escribirás cada clave de forma segura en un formulario web:
*   **Key**: `SUPABASE_URL` | **Value**: `https://xyz.supabase.co`
*   **Key**: `SUPABASE_KEY` | **Value**: `tu_clave_secreta_aqui`

---

### B. ¿Cómo manejar la autenticación de Google en la Nube? (Slides y Drive)
En tu computadora local, la aplicación abre una pestaña del navegador para que inicies sesión con Google y genera un archivo `token.json`. **En un servidor en la nube esto es imposible**, ya que el servidor no tiene pantalla ni navegador web para que hagas clic en "Aceptar".

Para solucionar esto, tienes **dos alternativas profesionales**:

---

#### Opción 1: Usar una Cuenta de Servicio de Google (Recomendada y 100% Autónoma)
Una **Cuenta de Servicio (Service Account)** es un "usuario bot" especial creado en tu Google Cloud Console que tiene sus propias credenciales en un único archivo JSON. No requiere inicio de sesión interactivo (no necesita navegador).

**Paso a paso para configurarla:**
1.  Ve a la [Google Cloud Console](https://console.cloud.google.com/).
2.  Selecciona tu proyecto y ve a **APIs & Services > Credentials** (APIs y Servicios > Credenciales).
3.  Haz clic en **Create Credentials > Service Account** (Crear credenciales > Cuenta de servicio).
4.  Ponle un nombre (ej. `cotizador-bot`) y dale el rol de **Editor** (u omitir roles adicionales si solo usarás Slides/Drive).
5.  Una vez creada la cuenta de servicio, haz clic sobre ella, ve a la pestaña **Keys** (Claves), haz clic en **Add Key > Create New Key** (Añadir clave > Crear clave nueva) y selecciona el formato **JSON**.
6.  Se descargará un archivo JSON (ej. `mi-proyecto-12345-abcde.json`). **¡Guárdalo bien, no lo subas a GitHub!**
7.  **Muy importante:** Abre tu Google Drive, ve a la carpeta donde guardas las cotizaciones, haz clic en Compartir y **comparte la carpeta con el correo de la Cuenta de Servicio** (el correo termina en `@...gserviceaccount.com`) dándole permisos de **Editor**. Haz lo mismo si la plantilla de Slides está en una carpeta compartida.
8.  En tu código Python, inicializa las credenciales usando ese JSON directamente.

**¿Cómo pasar el JSON al servidor sin subirlo a GitHub?**
Copia todo el contenido de ese archivo JSON descargado, y guárdalo como una sola variable de entorno llamada `GOOGLE_CREDS_JSON` en tu panel de Render/Railway.
En tu archivo de inicialización de Python (`app/google_slides/mcp.py` o donde autentiques), cargas las credenciales directamente desde la variable de entorno:

```python
import os
import json
from google.oauth2 import service_account

google_creds_raw = os.environ.get("GOOGLE_CREDS_JSON")

if google_creds_raw:
    # Cargar directamente desde la variable de entorno en producción
    creds_info = json.loads(google_creds_raw)
    credentials = service_account.Credentials.from_service_account_info(
        creds_info, 
        scopes=["https://www.googleapis.com/auth/presentations", "https://www.googleapis.com/auth/drive"]
    )
else:
    # Fallback local usando el archivo credentials.json de flujo OAuth normal
    # ... tu código local actual con flow/credentials.json ...
    pass
```

---

#### Opción 2: Almacenar los tokens OAuth locales como variables de entorno
Si quieres seguir usando tu cuenta de Google personal a través del flujo OAuth actual sin crear una cuenta de servicio, puedes guardar el contenido de tus archivos `credentials.json` y `token.json` como variables de entorno:

1.  Crea una variable de entorno llamada `GOOGLE_CREDENTIALS_CONTENT` y copia allí todo el contenido de tu archivo `credentials.json` local.
2.  Crea otra variable de entorno llamada `GOOGLE_TOKEN_CONTENT` y copia allí todo el contenido de tu archivo `token.json` local (este token ya está autorizado por ti y contiene el "Refresh Token" para auto-renovarse permanentemente).
3.  En tu código de Python, antes de inicializar la autenticación, haz que el script lea estas variables y escriba temporalmente los archivos en el disco del servidor para que las librerías de Google los lean normalmente:

```python
import os
import json

# Escribir temporalmente las credenciales si estamos en producción
if os.environ.get("GOOGLE_CREDENTIALS_CONTENT"):
    with open("credentials.json", "w") as f:
        f.write(os.environ.get("GOOGLE_CREDENTIALS_CONTENT"))

if os.environ.get("GOOGLE_TOKEN_CONTENT"):
    with open("token.json", "w") as f:
        f.write(os.environ.get("GOOGLE_TOKEN_CONTENT"))
```
*Este método es muy sencillo y requiere cambiar casi cero líneas de tu lógica actual de autenticación.*

---

## 3. Guía Paso a Paso para subir tu código a GitHub

Una vez que has verificado que tu `.gitignore` está en su lugar (¡ya lo está!), sigue estos pasos para subir tu código a GitHub de forma segura.

### Paso 1: Crear un repositorio en GitHub
1.  Inicia sesión en [GitHub](https://github.com/).
2.  Haz clic en el botón **New** (Nuevo repositorio).
3.  Escribe el nombre de tu repositorio (ej. `app-cotizaciones-onetrip`).
4.  **Recomendación:** Selecciona **Private** (Privado) para mayor privacidad de tu código de negocio. Solo tú y las personas que autorices podrán verlo (el despliegue en Render o Railway funciona perfectamente con repositorios privados).
5.  **No** selecciones agregar README, `.gitignore` ni licencia (ya que tu proyecto local ya los tiene).
6.  Haz clic en **Create repository**.

### Paso 2: Inicializar y subir desde tu terminal local
Abre tu terminal en la carpeta del proyecto (`c:\Users\uriel\OneDrive\Documentos\app-cotizaciones-onetrip-googleslides`) y ejecuta los siguientes comandos:

```bash
# 1. Inicializar el repositorio Git local
git init

# 2. Agregar todos los archivos al área de preparación (Git ignorará automáticamente lo que pusimos en .gitignore)
git add .

# 3. Comprobar qué archivos se van a subir (Asegúrate de que NO figuren credentials.json, token.json, .env ni la carpeta env)
git status

# 4. Crear el primer commit de confirmación
git commit -m "Initial commit - Versión estable de Cotizador"

# 5. Configurar la rama principal como 'main'
git branch -M main

# 6. Vincular tu Git local con el repositorio de GitHub (Reemplaza con el enlace que te dé GitHub)
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git

# 7. Subir el código a GitHub
git push -u origin main
```

---

## 4. ¿Dónde y cómo hacer el Despliegue (Deploy)?

Para aplicaciones web hechas con **Python (FastAPI / Flask)** en el backend y **HTML/CSS/JS** en el frontend, las dos mejores plataformas en la actualidad son **Render** y **Railway**. Ambas ofrecen capas gratuitas o de muy bajo costo y son extremadamente fáciles de usar.

### Despliegue en Render (Paso a Paso)
1.  Regístrate en [Render.com](https://render.com/) usando tu cuenta de GitHub.
2.  Haz clic en **New +** en el panel de control y selecciona **Web Service**.
3.  Conecta tu cuenta de GitHub y selecciona el repositorio de tu aplicación.
4.  Configura los siguientes parámetros:
    *   **Name**: `app-cotizaciones`
    *   **Region**: Selecciona la más cercana a tus clientes (ej. `Oregon` u `Ohio` para América).
    *   **Branch**: `main`
    *   **Runtime**: `Python 3`
    *   **Build Command**: `pip install -r requirements.txt` (esto instalará automáticamente FastAPI, Uvicorn, las librerías de Google y Supabase).
    *   **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (este comando inicia tu servidor FastAPI).
5.  Desplázate hacia abajo y haz clic en el botón **Advanced**.
6.  Haz clic en **Add Environment Variable** para definir tus claves de configuración. Configura las siguientes variables obligatorias:
    *   `SUPABASE_URL` = *(tu URL de Supabase)*
    *   `SUPABASE_KEY` = *(tu clave secreta de Supabase)*
    *   `GOOGLE_CREDENTIALS_CONTENT` = *(pega el contenido de credentials.json)*
    *   `GOOGLE_TOKEN_CONTENT` = *(pega el contenido de token.json)*
    *   `PORT` = `8000` (Render asignará un puerto dinámico de forma automática).
7.  Haz clic en **Create Web Service**.

¡Listo! Render compilará tu aplicación, instalará las dependencias y te proporcionará una URL pública segura (ej. `https://app-cotizaciones.onrender.com`) para que puedas usar tu aplicación desde cualquier dispositivo del mundo. Cada vez que hagas un cambio en tu código local y ejecutes `git push`, Render detectará el cambio y actualizará la web automáticamente.
