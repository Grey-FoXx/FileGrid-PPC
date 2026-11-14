#!/bin/sh
set -eu
test -r /run/filegrid/ftp-tls.crt
test -r /run/filegrid/ftp-tls.key
test -w /srv/ftp/data
: "${FTP_USER:?FTP_USER is required}"
: "${FTP_PASSWORD:?FTP_PASSWORD is required}"
exec python /server.py
