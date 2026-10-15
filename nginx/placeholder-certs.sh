#!/bin/sh
# Runs before nginx starts (nginx image's /docker-entrypoint.d hook).
# nginx refuses to start if any site's certificate is missing, which would
# take every site down while a new subdomain's certificate is still to be
# issued. For each Let's Encrypt certificate the config names that doesn't
# exist yet, point that site at a self-signed placeholder instead, so only
# that site shows a certificate warning. Once the real certificate is
# issued, `docker compose restart web` picks it up.
set -eu
conf=/etc/nginx/conf.d/default.conf
# Start from the config as built, so a restart after the certificate is
# issued switches the site back to it.
[ -f "$conf.orig" ] || cp "$conf" "$conf.orig"
cp "$conf.orig" "$conf"
for dir in $(grep -o '/etc/letsencrypt/live/[^/]*/' "$conf" | sort -u); do
  if [ ! -f "${dir}fullchain.pem" ] || [ ! -f "${dir}privkey.pem" ]; then
    echo "placeholder-certs: no certificate in ${dir}, using a self-signed placeholder for now" >&2
    sed -i "s#${dir}fullchain.pem#/etc/nginx/placeholder/fullchain.pem#g; s#${dir}privkey.pem#/etc/nginx/placeholder/privkey.pem#g" "$conf"
  fi
done
