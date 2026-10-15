FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .
RUN pnpm run build

FROM nginx:1.27-alpine

COPY nginx/inveontechnologies.in.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/placeholder-certs.sh /docker-entrypoint.d/05-placeholder-certs.sh
# Self-signed stand-in for a site whose certificate isn't issued yet (see
# nginx/placeholder-certs.sh). It is never trusted by browsers.
RUN apk add --no-cache openssl \
 && mkdir -p /etc/nginx/placeholder \
 && openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=certificate-pending" \
      -keyout /etc/nginx/placeholder/privkey.pem -out /etc/nginx/placeholder/fullchain.pem \
 && apk del openssl

COPY --from=build /app/dist/public /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
