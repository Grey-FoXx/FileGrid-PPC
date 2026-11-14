FROM python:3.12-slim
RUN pip install --no-cache-dir boto3==1.35.90
COPY infra/storage-init.py /init.py
ENTRYPOINT ["python","/init.py"]
