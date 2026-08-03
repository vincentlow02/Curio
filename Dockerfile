FROM mcr.microsoft.com/playwright:v1.61.1-noble AS base

WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_HEADLESS=true
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM base AS runner
ENV HOSTNAME=0.0.0.0
COPY --from=builder --chown=pwuser:pwuser /app/public ./public
COPY --from=builder --chown=pwuser:pwuser /app/.next/standalone ./
COPY --from=builder --chown=pwuser:pwuser /app/.next/static ./.next/static
COPY --from=builder --chown=pwuser:pwuser /app/node_modules/playwright ./node_modules/playwright
COPY --from=builder --chown=pwuser:pwuser /app/node_modules/playwright-core ./node_modules/playwright-core
RUN mkdir -p /app/.tmp && chown -R pwuser:pwuser /app/.tmp
USER pwuser

EXPOSE 3000
CMD ["node", "server.js"]
