# Inveon Cloud control plane image: the API, the built dashboard and the
# agent bundle that install.sh downloads, in one container.
FROM node:20-bookworm-slim AS build
WORKDIR /src

COPY control-plane/package.json control-plane/package-lock.json control-plane/
RUN cd control-plane && npm ci
COPY dashboard/package.json dashboard/package-lock.json dashboard/
RUN cd dashboard && npm ci
COPY agent/package.json agent/package-lock.json agent/
RUN cd agent && npm ci

COPY control-plane control-plane
COPY dashboard dashboard
COPY agent agent
RUN cd control-plane && npm run build && npm prune --omit=dev
RUN cd dashboard && npm run build
RUN cd agent && npm run bundle

FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    INVEON_PORT=4100 \
    INVEON_DASHBOARD_DIR=/app/dashboard \
    INVEON_AGENT_DIR=/app/agent
WORKDIR /app/control-plane
COPY --from=build /src/control-plane/package.json ./
COPY --from=build /src/control-plane/node_modules ./node_modules
COPY --from=build /src/control-plane/dist ./dist
COPY --from=build /src/dashboard/dist /app/dashboard
COPY --from=build /src/agent/install.sh /src/agent/inveon-agent.tar.gz /app/agent/
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4100/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
