FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY forwarder ./forwarder
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p /app/data

ENV PYTHONUNBUFFERED=1 \
    FORWARDER_DATA_DIR=/app/data

# Do not set a custom start command in the Railway dashboard.
# This entrypoint always expands PORT correctly.
ENTRYPOINT ["./entrypoint.sh"]
