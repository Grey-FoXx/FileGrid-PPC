FROM python:3.12-slim
WORKDIR /app
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock
COPY app app
COPY training training
RUN python training/train.py && chmod -R a+rX /app
ENV PYTHONUNBUFFERED=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
ENTRYPOINT ["python","app/worker.py"]
