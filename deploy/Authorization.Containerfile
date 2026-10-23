FROM node:24.22.1-alpine@sha256:1200d815de24f8dcca745fbf7651d166034a35adbcad8860a8538ffff44f1420 AS build

ENV CI=true
WORKDIR /workspace
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile && pnpm build

FROM build AS test
RUN apk add --no-cache openssl=3.5.9-r0 bash=5.3.9-r1
COPY eslint.config.mjs ./
COPY scripts ./scripts
COPY test ./test
COPY deploy ./deploy
CMD ["pnpm", "check"]

FROM build AS production-deps
RUN pnpm install --prod --frozen-lockfile

FROM node:24.22.1-alpine@sha256:1200d815de24f8dcca745fbf7651d166034a35adbcad8860a8538ffff44f1420
ENV NODE_ENV=production
WORKDIR /workspace
RUN npm install --global pnpm@11.19.0
COPY --from=production-deps --chown=node:node /workspace /workspace
USER node
EXPOSE 3001
HEALTHCHECK --interval=20s --timeout=4s --start-period=15s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/authorization-service/dist/main.js"]
