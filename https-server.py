#!/usr/bin/env python3
"""
Lokaler HTTPS-Server für die Seelotse-App.
Starten mit: python3 https-server.py
"""
import http.server, ssl, os, threading, time

PORT     = 8443
CERT_DIR = '/tmp/seelotse-cert.pem'
KEY_DIR  = '/tmp/seelotse-key.pem'

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # kein Log-Spam

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(certfile=CERT_DIR, keyfile=KEY_DIR)

httpd = http.server.HTTPServer(('0.0.0.0', PORT), Handler)
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

print(f"""
╔══════════════════════════════════════════════╗
║  Seelotse HTTPS-Server läuft                 ║
╠══════════════════════════════════════════════╣
║                                              ║
║  iPad Safari → https://192.168.178.131:8443  ║
║                                              ║
║  STRG+C zum Beenden                          ║
╚══════════════════════════════════════════════╝
""")

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer gestoppt.")
