FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /srv/ftp/data \
    && chown 1000:1000 /srv/ftp/data \
    && chmod 0755 /srv/ftp /srv/ftp/data
WORKDIR /app
COPY infra/ftp/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --disable-pip-version-check -r requirements.txt
COPY infra/ftp/server.py /server.py
COPY infra/ftp/entrypoint.sh /entrypoint.sh
COPY infra/ftp/healthcheck.sh /healthcheck.sh
RUN chmod +x /entrypoint.sh /healthcheck.sh
USER 1000:1000
ENTRYPOINT ["/entrypoint.sh"]
