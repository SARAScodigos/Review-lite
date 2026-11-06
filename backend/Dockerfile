FROM python:3.11-slim

# Evita la creación de archivos .pyc y fuerza buffer de salida para logs en tiempo real
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Instalar dependencias del sistema necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar e instalar requerimientos de Python
COPY req.txt /app/
RUN pip install --no-cache-dir -r req.txt

# Copiar el código fuente
COPY . /app/
