FROM node:26.7.0-alpine@sha256:b4fea132199070b0c8ea9ac66f363fe2cd6d1e4f994e61d8c87976c2157a1b8a

WORKDIR /workspace

RUN npm install --global pnpm@11.19.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc eslint.config.mjs tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile && pnpm build

CMD ["sh", "-ec", "pnpm db:migrate && exec pnpm start:control"]
