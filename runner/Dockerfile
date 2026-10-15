# Build context is the REPOSITORY ROOT (the runner imports ../shared).
#   docker build -f runner/Dockerfile -t proctored-runner:latest .
FROM mcr.microsoft.com/playwright:v1.55.0-noble AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY runner/package.json runner/package-lock.json* ./runner/
WORKDIR /app/runner
RUN npm ci --no-audit --no-fund
WORKDIR /app
COPY shared ./shared
COPY runner ./runner
WORKDIR /app/runner
RUN npm run build
RUN npm prune --omit=dev

FROM mcr.microsoft.com/playwright:v1.55.0-noble AS runtime
ENV NODE_ENV=production
WORKDIR /app/runner
COPY runner/package.json ./
COPY --from=build /app/runner/node_modules ./node_modules
COPY --from=build /app/runner/dist ./dist

# Never run the browser as root.
USER pwuser
EXPOSE 4000

HEALTHCHECK --interval=20s --timeout=4s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/runner/src/index.js"]
