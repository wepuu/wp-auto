# Offline candidate test layer only. Builder verifies this tag's immutable ID.
FROM wepuu-r4br1-test:248f9cc6616c
ARG WEPUU_SOURCE_REVISION
LABEL org.opencontainers.image.revision=$WEPUU_SOURCE_REVISION
WORKDIR /workspace
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY deploy ./deploy
RUN pnpm build
CMD ["pnpm", "check"]
