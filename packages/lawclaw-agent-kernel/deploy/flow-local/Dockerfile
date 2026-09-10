ARG BASE_IMAGE=node:24-bookworm-slim
FROM ${BASE_IMAGE}
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev --no-audit --no-fund
COPY flow-server.mjs ./flow-server.mjs
COPY flow-engine-test.mjs flow-crash-worker.mjs flow-engine-admin.mjs ./
ENV NODE_ENV=production PI_OFFLINE=1
EXPOSE 8080
CMD ["node", "flow-server.mjs"]
