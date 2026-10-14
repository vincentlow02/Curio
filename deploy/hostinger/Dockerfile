FROM node:24-alpine AS builder

WORKDIR /workspace
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY gateway/tsconfig.json gateway/main.ts gateway/rakuten-gateway.ts gateway/runtime-package.json ./gateway/
COPY src/server/config/env.ts ./src/server/config/env.ts
COPY src/server/providers/marketplaces/rakuten-api-client.ts ./src/server/providers/marketplaces/rakuten-api-client.ts
COPY src/server/providers/marketplaces/shared/http.ts ./src/server/providers/marketplaces/shared/http.ts
RUN npx tsc --project gateway/tsconfig.json

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001

COPY --from=builder /workspace/.gateway-build ./.gateway-build
COPY gateway/runtime-package.json ./package.json
COPY --from=builder /workspace/node_modules/server-only ./node_modules/server-only

USER node
EXPOSE 3001
CMD ["node", "--conditions=react-server", "./.gateway-build/gateway/main.js"]