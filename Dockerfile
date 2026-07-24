FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S hiresmart && adduser -S hiresmart -G hiresmart
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
RUN mkdir -p uploads logs && chown -R hiresmart:hiresmart /app
USER hiresmart
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:5000/health/ready || exit 1
CMD ["node", "src/server.js"]
