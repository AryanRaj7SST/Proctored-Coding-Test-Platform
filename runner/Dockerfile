# Build context is the REPOSITORY ROOT (the runner imports ../shared).
#   docker build -f runner/Dockerfile -t proctored-runner:latest .
FROM mcr.microsoft.com/playwright:v1.55.0-noble AS build
WORKDIR /app
COPY runner/package.json runner/package-lock.json* ./runner/
WORKDIR /app/runner
RUN npm install --no-audit --no-fund
WORKDIR /app
COPY shared ./shared
COPY runner ./runner
WORKDIR /app/runner
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.55.0-noble AS runtime
ENV NODE_ENV=production
WORKDIR /app/runner
COPY runner/package.json runner/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/runner/dist ./dist

# Never run the browser as root.
USER pwuser
EXPOSE 4000

HEALTHCHECK --interval=20s --timeout=4s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/runner/src/index.js"]
