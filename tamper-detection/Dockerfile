FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 \
  && rm -rf /var/lib/apt/lists/*

COPY tamper-detection/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY tamper-detection/app ./app

CMD ["python", "-m", "app.main"]
