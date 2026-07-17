FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_HEADLESS=true
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
