# Domain & Deployment Plan — portal.inveontechnologies.in

## What you need to do (DNS + server), not something I can do remotely

1. **DNS**: add an `A` record for `portal.inveontechnologies.in` pointing at the same server IP that `inveontechnologies.in` and `crm.inveontechnologies.in` already point to.
2. **TLS certificate**: your `certbot` sidecar in `docker-compose.yml` needs to issue a cert for the new subdomain. Once DNS has propagated, run (on the server, same way you issued the existing certs):
   ```bash
   docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d portal.inveontechnologies.in
   ```
   Then reload nginx: `docker compose exec web nginx -s reload`.
3. **Deploy the two new containers** (`portal-frontend`, `portal-backend`) — added to `docker-compose.yml` in this change — with `docker compose up -d --build portal-frontend portal-backend`.

## What's already wired up in this change

- `docker-compose.yml`: two new services, `portal-frontend` and `portal-backend`, both attached to the existing `crm_crm_network` so the shared nginx container can reach them by container name — exactly how `crm_frontend`/`crm_backend` already work.
- `nginx/inveontechnologies.in.conf`: new `portal.inveontechnologies.in` server block (HTTP→HTTPS redirect + HTTPS block), proxying `/` to `portal-frontend:3000` and `/api/` to `portal-backend:4000` — same shape as the existing `crm.` / `api.` blocks.

## Why a new subdomain instead of a path

You chose `portal.inveontechnologies.in` over `inveontechnologies.in/portal`. This is the simpler option operationally: independent deploys (portal releases don't require rebuilding the marketing site), independent scaling, and no path-based routing edge cases in the SPA router. The trade-off is one extra DNS record and one extra cert — both are one-time setup steps above.
