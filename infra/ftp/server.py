#!/usr/bin/env python3
"""Private explicit-FTPS storage endpoint for FileGrid."""

import logging
import os
from pathlib import Path

from OpenSSL import SSL
from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import TLS_FTPHandler
from pyftpdlib.servers import FTPServer


DATA_DIR = Path("/srv/ftp/data")
CERT_FILE = "/run/filegrid/ftp-tls.crt"
KEY_FILE = "/run/filegrid/ftp-tls.key"


class FileGridFTPSHandler(TLS_FTPHandler):
    tls_control_required = True
    tls_data_required = True
    passive_ports = range(30000, 30010)
    permit_foreign_addresses = False
    banner = "FileGrid FTPS ready."


def tls_context():
    context = SSL.Context(SSL.TLS_SERVER_METHOD)
    context.set_min_proto_version(SSL.TLS1_2_VERSION)
    context.set_options(SSL.OP_NO_COMPRESSION)
    context.use_certificate_chain_file(CERT_FILE)
    context.use_privatekey_file(KEY_FILE)
    context.check_privatekey()
    return context


def main():
    logging.basicConfig(
        level=os.environ.get("FTP_LOG_LEVEL", "WARNING").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    username = os.environ["FTP_USER"]
    password = os.environ["FTP_PASSWORD"]

    authorizer = DummyAuthorizer()
    authorizer.add_user(username, password, str(DATA_DIR), perm="elrwf")
    FileGridFTPSHandler.authorizer = authorizer
    FileGridFTPSHandler.ssl_context = tls_context()
    server = FTPServer(("0.0.0.0", 21), FileGridFTPSHandler)
    server.max_cons = 128
    server.max_cons_per_ip = 128
    server.serve_forever()


if __name__ == "__main__":
    main()
