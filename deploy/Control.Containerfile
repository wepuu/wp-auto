FROM node:26.7.0-alpine@sha256:b4fea132199070b0c8ea9ac66f363fe2cd6d1e4f994e61d8c87976c2157a1b8a AS build

ENV CI=true
WORKDIR /workspace
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile && pnpm build && pnpm install --prod --frozen-lockfile

FROM node:26.7.0-alpine@sha256:b4fea132199070b0c8ea9ac66f363fe2cd6d1e4f994e61d8c87976c2157a1b8a
ENV NODE_ENV=production WEPUU_CONTROL_HOST=0.0.0.0 WEPUU_CONTROL_PORT=3000
WORKDIR /workspace
RUN npm install --global pnpm@11.19.0
COPY --from=build --chown=node:node /workspace /workspace
USER node
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=4s --start-period=15s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["sh", "-ec", "node packages/database/dist/cli.js migrate && exec node apps/control-api/dist/main.js"]
