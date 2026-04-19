FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["python", "-c", "import sys; c=open('/proc/1/cmdline','rb').read().decode('utf-8','ignore'); sys.exit(0 if ('python' in c and 'main.py' in c) else 1)"]

CMD ["python", "main.py"]
