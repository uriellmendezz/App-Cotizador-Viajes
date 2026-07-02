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