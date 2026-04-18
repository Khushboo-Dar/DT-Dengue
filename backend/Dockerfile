FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Generate dataset, train model, then copy metrics to /app root
# (so the volume mount on /app/data doesn't hide them at runtime)
RUN mkdir -p data \
    && python generate_synthetic_data.py \
    && python train.py \
    && cp data/validation_metrics.json /app/validation_metrics.json \
    && cp data/feature_importance.json /app/feature_importance.json

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
