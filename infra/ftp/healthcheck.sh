#!/bin/sh
exec python -c 'import socket; s=socket.create_connection(("127.0.0.1", 21), timeout=3); f=s.makefile("rb"); greeting=f.readline(512); s.close(); raise SystemExit(0 if greeting.startswith(b"220") else 1)'
