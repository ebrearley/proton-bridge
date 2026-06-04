# syntax=docker/dockerfile:1.7
ARG DEBIAN_VERSION=trixie-slim
ARG BRIDGE_DEB_VERSION=3.23.1-1

FROM debian:${DEBIAN_VERSION} AS verifier
ARG BRIDGE_DEB_VERSION
ARG BRIDGE_DEB_URL=https://proton.me/download/bridge/protonmail-bridge_${BRIDGE_DEB_VERSION}_amd64.deb
ARG PROTON_BRIDGE_KEY_ID=E2C75D68E6234B07

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl debian-keyring debsig-verify gnupg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp/proton-bridge

# Proton package verification source:
# https://proton.me/support/verifying-bridge-package
RUN set -eux; \
  curl -fsSL "$BRIDGE_DEB_URL" -o protonmail-bridge.deb; \
  mkdir -p "/etc/debsig/policies/${PROTON_BRIDGE_KEY_ID}" "/usr/share/debsig/keyrings/${PROTON_BRIDGE_KEY_ID}"; \
  curl -fsSL https://proton.me/download/bridge/bridge.pol \
    -o "/etc/debsig/policies/${PROTON_BRIDGE_KEY_ID}/bridge.pol"; \
  curl -fsSL https://proton.me/download/bridge/bridge_pubkey.gpg \
    -o bridge_pubkey.gpg; \
  gpg --dearmor --output "/usr/share/debsig/keyrings/${PROTON_BRIDGE_KEY_ID}/debsig.gpg" bridge_pubkey.gpg; \
  debsig-verify protonmail-bridge.deb

FROM debian:${DEBIAN_VERSION} AS runtime
ARG BRIDGE_DEB_VERSION

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg gosu pass python3 python3-pip socat stunnel4 tini \
  && rm -rf /var/lib/apt/lists/*

COPY --from=verifier /tmp/proton-bridge/protonmail-bridge.deb /tmp/protonmail-bridge.deb
RUN apt-get update \
  && apt-get install -y --no-install-recommends /tmp/protonmail-bridge.deb \
  && rm -f /tmp/protonmail-bridge.deb \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --home-dir /data --shell /usr/sbin/nologin --uid 10001 bridge

WORKDIR /opt/proton-bridge
COPY bridge/requirements.txt /opt/proton-bridge/requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r /opt/proton-bridge/requirements.txt
COPY bridge/control_server.py /opt/proton-bridge/control_server.py
COPY bridge/entrypoint.sh /opt/proton-bridge/entrypoint.sh

RUN chmod +x /opt/proton-bridge/entrypoint.sh \
  && mkdir -p /data \
  && chown -R bridge:bridge /data /opt/proton-bridge

ENV BRIDGE_DEB_VERSION=${BRIDGE_DEB_VERSION}
ENV BRIDGE_HOME=/data
ENV BRIDGE_BIN=/usr/lib/protonmail/bridge/bridge
ENV BRIDGE_ARGS=--noninteractive
ENV BRIDGE_CONTROL_HOST=0.0.0.0
ENV BRIDGE_CONTROL_PORT=8081
ENV BRIDGE_IMAP_FORWARD_LISTEN=0.0.0.0:143
ENV BRIDGE_IMAP_FORWARD_TARGET=127.0.0.1:1143
ENV BRIDGE_SMTP_FORWARD_LISTEN=0.0.0.0:25
ENV BRIDGE_SMTP_FORWARD_TARGET=127.0.0.1:1025
ENV BRIDGE_TLS_CERT_FILE=
ENV BRIDGE_TLS_KEY_FILE=
ENV BRIDGE_STUNNEL_BIN=stunnel4
ENV BRIDGE_IMAP_TLS_BACKEND_LISTEN=127.0.0.1:10143
ENV BRIDGE_SMTP_TLS_BACKEND_LISTEN=127.0.0.1:10025

VOLUME ["/data"]
EXPOSE 143 25 8081
ENTRYPOINT ["/usr/bin/tini", "--", "/opt/proton-bridge/entrypoint.sh"]
