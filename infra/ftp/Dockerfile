FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends vsftpd openssl && rm -rf /var/lib/apt/lists/* && mkdir -p /var/run/vsftpd/empty
COPY infra/ftp/vsftpd.conf /etc/vsftpd.conf
COPY infra/ftp/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
