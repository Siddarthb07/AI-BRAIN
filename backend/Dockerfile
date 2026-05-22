FROM python:3.11-slim

WORKDIR /app

# System deps for audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    espeak-ng \
    libsndfile1 \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m pip install --upgrade pip setuptools wheel --retries 10 --timeout 120
RUN python -m pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
