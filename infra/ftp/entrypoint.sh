#!/bin/sh
set -eu
id filegrid >/dev/null 2>&1 || useradd -m -d /srv/ftp -s /bin/bash filegrid
printf 'filegrid:%s\n' "$FTP_PASSWORD" | chpasswd
mkdir -p /srv/ftp/data
chown root:root /srv/ftp
chmod 755 /srv/ftp
chown filegrid:filegrid /srv/ftp/data
exec /usr/sbin/vsftpd /etc/vsftpd.conf
