#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
CERT_DIR="$PWD/.certs"
mkdir -p "$CERT_DIR"
chmod 700 "$CERT_DIR"
LAN_IP="${1:-${LAN_IP:-$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([^ ]*\).*/\1/p' | head -n1)}}"
if [[ -z "$LAN_IP" ]]; then
  echo "Could not detect the LAN IP. Run: npm run dev:https -- 192.168.1.5" >&2
  exit 1
fi

# The CA private key and HTTPS key stay local and are ignored by git.
if [[ ! -f "$CERT_DIR/ca.key" || ! -f "$CERT_DIR/ca.crt" ]]; then
  openssl req -x509 -newkey rsa:3072 -sha256 -days 3650 -nodes \
    -keyout "$CERT_DIR/ca.key" -out "$CERT_DIR/ca.crt" \
    -subj "/CN=Smart Irrigation Local Development CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
  chmod 600 "$CERT_DIR/ca.key"
fi

cat > "$CERT_DIR/lan-ext.cnf" <<EOF
[req]
distinguished_name=dn
req_extensions=req_ext
prompt=no
[dn]
CN=$LAN_IP
[req_ext]
subjectAltName=@alt_names
[server_cert]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names
[alt_names]
IP.1=$LAN_IP
DNS.1=localhost
IP.2=127.0.0.1
EOF
openssl req -new -newkey rsa:2048 -nodes -sha256 \
  -keyout "$CERT_DIR/lan-key.pem" -out "$CERT_DIR/lan.csr" \
  -config "$CERT_DIR/lan-ext.cnf"
openssl x509 -req -in "$CERT_DIR/lan.csr" -CA "$CERT_DIR/ca.crt" \
  -CAkey "$CERT_DIR/ca.key" -CAcreateserial -out "$CERT_DIR/lan-cert.pem" \
  -days 365 -sha256 -extfile "$CERT_DIR/lan-ext.cnf" -extensions server_cert
chmod 600 "$CERT_DIR/lan-key.pem"
rm -f "$CERT_DIR/lan.csr" "$CERT_DIR/lan-ext.cnf"

echo "HTTPS address: https://$LAN_IP:3001"
echo "Install this CA certificate on your phone and trust it: $CERT_DIR/ca.crt"
exec node_modules/.bin/next dev --hostname 0.0.0.0 --port 3001 \
  --experimental-https --experimental-https-key "$CERT_DIR/lan-key.pem" \
  --experimental-https-cert "$CERT_DIR/lan-cert.pem"
