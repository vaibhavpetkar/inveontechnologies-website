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

## Portal settings added after launch

Add these to `portal-backend/.env` on the server (next to the existing `PORTAL_*` values), then `docker compose up -d --build portal-backend`.

### Email (verification, password reset, assessment invites, certificates)

Without `PORTAL_SMTP_HOST`, emails are only written to the backend log — password reset can't work that way. To send them through the Mailcow server at `mail.inveontechnologies.in`, create a mailbox (e.g. `no-reply@inveontechnologies.in`) and set:

```
PORTAL_SMTP_HOST=mail.inveontechnologies.in
PORTAL_SMTP_PORT=587
PORTAL_SMTP_SECURE=false          # STARTTLS on 587; use 465 + true for implicit TLS
PORTAL_SMTP_USER=no-reply@inveontechnologies.in
PORTAL_SMTP_PASSWORD=<mailbox password>
PORTAL_MAIL_FROM=Inveon Portal <no-reply@inveontechnologies.in>
```

Check `docker compose logs portal-backend` for `Email sent` / `Email sending failed` after registering a test account.

### Require verified email before applying

```
PORTAL_REQUIRE_EMAIL_VERIFICATION=true
```

Off by default. Turn it on only once email sending works; candidates then have to click the link in the verification email (they can request a new one from the apply page) before they can apply.

## Staff accounts and hiring managers

- **Accounts and roles:** sign in as the super admin; the staff console (`/admin`) has a *Team accounts* section to create HR/manager/admin accounts and change roles (API: `GET/POST /api/v1/users`, `PUT /api/v1/users/:id/role`). A role change applies within 15 minutes — the person is asked to sign in again.
- **Managers see their own team only:** set an opportunity's `hiringManagerId` (create/update opportunity API) to a manager. That manager can then see and move that opportunity's candidates; a manager assigned as an interviewer can see that one application and record feedback. HR, admin and super admin still see everything.

## Tests and CI

`portal-backend` has an automated test suite (`npm test`, needs a disposable Postgres in `TEST_DATABASE_URL`), and `.github/workflows/ci.yml` runs it plus typecheck/build for all three apps on every push and pull request.
