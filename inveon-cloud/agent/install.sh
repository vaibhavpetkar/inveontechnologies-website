#!/usr/bin/env bash
# Inveon Cloud agent installer (Ubuntu/Debian).
#
#   curl -fsSL __INVEON_URL__/install.sh | sudo bash -s -- <install token>
#
# The control plane fills in __INVEON_URL__ when it serves this file. The
# install token is single use and expires 15 minutes after it was created.
set -euo pipefail

INVEON_URL="__INVEON_URL__"
TOKEN="${1:-}"
PREFIX=/opt/inveon-agent
CONFIG=/etc/inveon-agent/config.json

die() { echo "inveon-agent install: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

[ -n "$TOKEN" ] || die "usage: curl -fsSL $INVEON_URL/install.sh | sudo bash -s -- <install token>"
[[ "$TOKEN" =~ ^[A-Za-z0-9_-]{20,200}$ ]] || die "that doesn't look like an install token"
[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
[ -r /etc/os-release ] && . /etc/os-release
case "${ID:-}" in ubuntu|debian) ;; *) die "only Ubuntu and Debian are supported for now" ;; esac

export DEBIAN_FRONTEND=noninteractive

step "Installing packages (nginx, certbot, curl, tar, git)"
apt-get update -y -q
apt-get install -y -q ca-certificates curl tar gzip nginx certbot git openssh-client

if ! command -v aws >/dev/null 2>&1; then
  step "Installing the AWS CLI (for backups)"
  apt-get install -y -q awscli || snap install aws-cli --classic || echo "warning: install the AWS CLI by hand to use backups"
fi

if ! command -v docker >/dev/null 2>&1; then
  step "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "docker compose v2 is required"
systemctl enable --now docker

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 20 ]; then
  step "Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -q nodejs
fi

step "Downloading the agent from $INVEON_URL"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$INVEON_URL/agent/inveon-agent.tar.gz" -o "$TMP/agent.tar.gz"
rm -rf "$PREFIX.new"
mkdir -p "$PREFIX.new"
tar -xzf "$TMP/agent.tar.gz" -C "$PREFIX.new" --no-same-owner
rm -rf "$PREFIX"
mv "$PREFIX.new" "$PREFIX"

step "Preparing folders"
install -d -m 0700 /etc/inveon-agent /var/lib/inveon-agent
install -d -m 0750 /srv/inveon/apps
install -d -m 0700 /root/.docker
install -d -m 0755 /var/www/inveon-acme /etc/nginx/conf.d /var/lib/letsencrypt /var/log/letsencrypt /etc/letsencrypt

step "Registering this server"
node "$PREFIX/dist/index.js" register --url "$INVEON_URL" --token "$TOKEN" --config "$CONFIG"

step "Starting the agent"
install -m 0644 "$PREFIX/inveon-agent.service" /etc/systemd/system/inveon-agent.service
systemctl daemon-reload
systemctl enable --now inveon-agent
systemctl enable --now nginx

echo
echo "Done. This server should show as online in Inveon Cloud within a few seconds."
echo "Logs: journalctl -u inveon-agent -f"
