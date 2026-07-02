# Guía de Despliegue en Hugging Face Spaces con Docker
## FastAPI + WeasyPrint + Google Slides API + Supabase

Esta guía te guiará paso a paso para desplegar tu aplicación en **Hugging Face Spaces** utilizando un contenedor **Docker**. 

Dado que tu aplicación utiliza **WeasyPrint** (que requiere dependencias del sistema como Cairo, Pango y GdkPixbuf para la generación de PDFs) y necesita escribir ciertos archivos en tiempo de ejecución (como configuraciones de agencia y tokens de Google), Hugging Face Spaces en su modalidad **Docker Space** es la mejor opción gratuita del mercado. A diferencia de Vercel, Hugging Face te proporciona un entorno de contenedores completo sin restricciones de librerías nativas.

---

## Tabla de Contenidos
1. [Requisitos Previos](#1-requisitos-previos)
2. [Adaptación del Dockerfile para Hugging Face](#2-adaptación-del-dockerfile-para-hugging-face)
3. [Creación del Space en Hugging Face](#3-creación-del-space-en-hugging-face)
4. [Configuración de Variables de Entorno y Secretos (Secrets)](#4-configuración-de-variables-de-entorno-y-secretos-secrets)
5. [Despliegue del Código](#5-despliegue-del-código)
   - [Opción A: Despliegue Directo vía Git CLI (Recomendado para empezar)](#opción-a-despliegue-directo-vía-git-cli-recomendado-para-empezar)
   - [Opción B: Despliegue Automático con GitHub Actions (CI/CD)](#opción-b-despliegue-automático-con-github-actions-cicd)
6. [Monitoreo y Solución de Problemas (Troubleshooting)](#6-monitoreo-y-solución-de-problemas-troubleshooting)

---

## 1. Requisitos Previos

Antes de comenzar, asegúrate de tener:
* Una cuenta gratuita en [Hugging Face](https://huggingface.co/).
* Tu repositorio local configurado y funcionando.
* Acceso a las credenciales de tu proyecto (Supabase, Groq y Google Slides API).

---

## 2. Adaptación del Dockerfile para Hugging Face

Hugging Face Spaces tiene dos reglas de seguridad muy estrictas para los contenedores Docker:
1. **Puerto Obligatorio:** El contenedor debe escuchar y exponer el puerto **`7860`**. El proxy de Hugging Face redirigirá el tráfico web a este puerto.
2. **Usuario No-Root:** Por seguridad, el contenedor se ejecuta con un usuario no privilegiado con el **UID `1000`**. Si tu contenedor corre como `root`, la construcción podría fallar o tener errores de escritura en disco al intentar crear archivos dinámicos (como `agency_config.json` o `token.json`).

Vamos a modificar tu [Dockerfile](file:///c:/Users/uriel/OneDrive/Documentos/app-cotizaciones-onetrip-googleslides/Dockerfile) actual para cumplir con estas directivas de manera robusta.

### Dockerfile Optimizado

Reemplaza el contenido de tu [Dockerfile](file:///c:/Users/uriel/OneDrive/Documentos/app-cotizaciones-onetrip-googleslides/Dockerfile) con el siguiente código:

```dockerfile
# ==============================================================================
# Dockerfile para Hugging Face Spaces (FastAPI + WeasyPrint)
# ==============================================================================
FROM python:3.11-slim

# Evitar que Python escriba archivos .pyc y activar el búfer de salida
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Instalar dependencias del sistema requeridas por WeasyPrint (Cairo, Pango, GdkPixbuf, etc.)
# También instalamos fuentes básicas para asegurar que los PDFs rendericen correctamente
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-liberation \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Configurar el usuario no privilegiado (UID 1000 requerido por Hugging Face Spaces)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Establecer el directorio de trabajo en la carpeta personal del usuario
WORKDIR $HOME/app

# Copiar el archivo de requerimientos e instalar las dependencias de Python como el usuario 'user'
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Copiar el resto de los archivos del proyecto asignando la propiedad al usuario 'user'
COPY --chown=user . .

# Crear el directorio para configuraciones y tokens con los permisos correctos
RUN mkdir -p config && chmod -R 777 config

# Exponer el puerto obligatorio de Hugging Face Spaces
EXPOSE 7860

# Comando para ejecutar la aplicación escuchando en el puerto 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
```

> [!NOTE]
> La adición de `fonts-liberation` y `fontconfig` en el Dockerfile asegura que WeasyPrint tenga fuentes del sistema instaladas para renderizar textos en el PDF sin problemas de caracteres invisibles o fuentes por defecto rotas.

---

## 3. Creación del Space en Hugging Face

Sigue estos pasos para crear tu espacio en la plataforma de Hugging Face:

1. Ve a tu cuenta de Hugging Face y haz clic en **Spaces** en la barra superior, o ingresa a [huggingface.co/new-space](https://huggingface.co/new-space).
2. Configura los siguientes campos:
   * **Space name**: Elige un nombre para tu app (ej. `cotizador-viajes-onetrip`).
   * **License**: Puedes dejarlo en blanco o elegir una (ej. `mit`).
   * **SDK**: Selecciona **Docker**.
   * **Docker template**: Selecciona **Blank** (esto nos permitirá usar nuestro propio Dockerfile personalizado).
   * **Space Hardware**: Elige la opción **CPU basic** (es 100% gratuita y funciona 24/7 de forma permanente).
   * **Privacy**: Puedes configurarlo como **Public** (cualquiera puede ver tu app y código) o **Private** (solo tú puedes interactuar con él o ver el código).
3. Haz clic en **Create Space**.

Una vez creado, verás una pantalla con instrucciones de Git. **No subas el código todavía**, primero configuremos los secretos.

---

## 4. Configuración de Variables de Entorno y Secretos (Secrets)

Tu aplicación requiere acceso a base de datos (Supabase), inteligencia artificial (Groq) e integraciones con Google Slides. Para proteger estos tokens y que no queden expuestos en el repositorio de Git del Space:

1. Dentro de la página de tu Space, ve a la pestaña **Settings** (esquina superior derecha).
2. Baja hasta encontrar la sección **Variables and secrets**.
3. Añade tus variables de entorno haciendo clic en **New secret** (para credenciales y API keys que deban estar encriptadas) o **New variable** (para configuraciones públicas).

### Variables y Secretos a registrar:

| Tipo | Clave / Nombre | Valor recomendado | Descripción |
| :--- | :--- | :--- | :--- |
| **Secret** | `SUPABASE_URL` | `https://xxxx.supabase.co` | La URL de tu base de datos Supabase. |
| **Secret** | `SUPABASE_KEY` | `eyJhbGc...` | Tu API key pública de Supabase. |
| **Secret** | `GROQ_API_KEY` | `gsk_xxxx...` | Tu clave de API de Groq para la IA. |
| **Secret** | `GOOGLE_CREDENTIALS` | *(Contenido de `credentials.json` en una sola línea)* | Credenciales de tu OAuth / Cuenta de servicio de Google. |
| **Secret** | `GOOGLE_TOKEN` | *(Contenido de `token.json` en una sola línea)* | Token de autenticación activa del usuario. |

> [!IMPORTANT]
> **¿Cómo ingresar los JSON de Google en una sola línea?**
> Abre tu archivo `credentials.json` o `token.json` local en un editor, remueve los saltos de línea para que quede en una sola línea de texto continuo (o usa una herramienta online de formateo JSON en una sola línea), y copia todo ese texto JSON plano en el valor del Secret en Hugging Face.
> El código en [app/google_slides/exporter.py](file:///c:/Users/uriel/OneDrive/Documentos/app-cotizaciones-onetrip-googleslides/app/google_slides/exporter.py#L18-L38) ya está preparado para leer estas variables de entorno en formato JSON y autenticarse automáticamente sin necesidad de que los archivos existan físicamente en el repositorio.

---

## 5. Despliegue del Código

Puedes subir tu código a Hugging Face usando Git de forma directa o automatizarlo mediante GitHub Actions.

### Opción A: Despliegue Directo vía Git CLI

Este método sube los archivos directamente desde tu máquina local al repositorio Git de Hugging Face.

1. **Instala Git LFS** (Large File Storage) si no lo tienes instalado, ya que Hugging Face lo requiere para el manejo de archivos grandes:
   ```bash
   git lfs install
   ```

2. **Agrega el repositorio de Hugging Face como un remoto adicional** en tu Git local:
   ```bash
   # Reemplaza 'tu-usuario' y 'tu-space-name' con tus datos reales
   git remote add hf https://huggingface.co/spaces/tu-usuario/tu-space-name
   ```

3. **Crea un archivo `.hfignore` (opcional)** en la raíz de tu proyecto para evitar subir archivos locales innecesarios o sensibles como `.env`, carpetas de entornos virtuales o credenciales locales:
   ```text
   # .hfignore
   .env
   .env.local
   env/
   venv/
   __pycache__/
   .vscode/
   config/service_account.json
   credentials.json
   token.json
   ```

4. **Sube tus cambios al Space:**
   ```bash
   git add .
   git commit -m "Preparando despliegue para Hugging Face Spaces"
   git push hf main --force
   ```
   *Nota: Si Hugging Face te solicita credenciales al hacer push, usa tu **nombre de usuario** de Hugging Face y, como contraseña, genera un **Access Token** de escritura en [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).*

---

### Opción B: Despliegue Automático con GitHub Actions

Si ya tienes tu código en un repositorio de **GitHub** y quieres que cada vez que hagas `git push` a la rama `main` de GitHub se actualice automáticamente tu aplicación en Hugging Face, sigue estos pasos:

1. **Obtén un Token de Hugging Face:**
   * Ve a [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
   * Haz clic en **Create new token**.
   * Asígnale el rol de **Write** (Escritura) y cópialo.

2. **Guarda el Token en GitHub:**
   * Ve a tu repositorio en GitHub.
   * Navega a **Settings** -> **Secrets and variables** -> **Actions**.
   * Haz clic en **New repository secret**.
   * Nómbralo `HF_TOKEN` y pega el token de Hugging Face que acabas de copiar.

3. **Crea el archivo del Workflow de GitHub Actions:**
   Crea la ruta de directorios y el archivo `.github/workflows/deploy.yml` en tu proyecto con el siguiente contenido:

```yaml
name: Deploy to Hugging Face Spaces

on:
  push:
    branches:
      - main
  # Permite ejecutar el deploy manualmente desde la pestaña de Actions
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3
        with:
          fetch-depth: 0
          lfs: true

      - name: Push to Hugging Face Spaces
        env:
          # Reemplaza con tu usuario y nombre del Space
          HF_SPACE_URL: "https://huggingface.co/spaces/tu-usuario/tu-space-name"
          HF_TOKEN: ${{ secrets.HF_TOKEN }}
        run: |
          git remote add hf https://user:$HF_TOKEN@huggingface.co/spaces/tu-usuario/tu-space-name
          # Forzar el empuje a la rama main del space
          git push hf main --force
```

---

## 6. Monitoreo y Solución de Problemas (Troubleshooting)

### Ver logs en vivo
Una vez que haces push de tu código, Hugging Face Spaces comenzará automáticamente a construir la imagen de Docker y a correr el contenedor.
* Puedes ver el progreso en tiempo real haciendo clic en la pestaña **Logs** en la parte superior de tu Space.
* Si ocurre algún error durante la instalación de paquetes o dependencias de WeasyPrint, lo verás reflejado en la pestaña **Container** de los logs.

### Error de permisos de escritura (Read-only filesystem)
Si la app arroja errores como `Permission denied: 'config/agency_config.json'`, asegúrate de que:
1. Estás usando el Dockerfile adaptado que define el usuario `user` con UID `1000`.
2. Has ejecutado `RUN mkdir -p config && chmod -R 777 config` en el Dockerfile para dar permisos completos de escritura a ese directorio de trabajo.

### Reiniciar el Space
Si tu aplicación se queda colgada o necesitas forzar un reinicio del contenedor tras actualizar alguna variable de entorno:
1. Ve a la pestaña **Settings** de tu Space.
2. Desplázate hacia abajo y haz clic en **Factory Reboot** (para reconstruir la imagen de Docker desde cero) o **Restart Space** (para reiniciar el contenedor actual).
