# Local-only regression artifacts. All three parents are checked by immutable ID
# before and after build. Dependencies are reused without install or network.
FROM wepuu-r9-test:eb5f5b573d95-3acf89695fd0 AS build
ARG WEPUU_SOURCE_REVISION
LABEL org.opencontainers.image.revision=$WEPUU_SOURCE_REVISION
WORKDIR /workspace
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY test ./test
COPY deploy ./deploy
COPY eslint.config.mjs ./
# Remove only the inherited old filename: its preserved historical source now
# lives at the explicitly version-scoped .characterization.mjs path.
RUN test -f /workspace/scripts/multisite-r8-storage-boundary.test.mjs && rm -- /workspace/scripts/multisite-r8-storage-boundary.test.mjs && pnpm build && pnpm lint

FROM build AS test
CMD ["pnpm", "check"]

FROM wepuu-r4br2-authorization:a3aaf70780ad-fdf45454dea0 AS authorization
ARG WEPUU_SOURCE_REVISION
LABEL org.opencontainers.image.revision=$WEPUU_SOURCE_REVISION
COPY --from=build --chown=node:node /workspace/apps /workspace/apps
COPY --from=build --chown=node:node /workspace/packages /workspace/packages
USER node
CMD ["node", "apps/authorization-service/dist/main.js"]

FROM wepuu-r4br1-control:248f9cc6616c AS control
ARG WEPUU_SOURCE_REVISION
LABEL org.opencontainers.image.revision=$WEPUU_SOURCE_REVISION
COPY --from=build --chown=node:node /workspace/apps /workspace/apps
COPY --from=build --chown=node:node /workspace/packages /workspace/packages
USER node
CMD ["node", "apps/control-api/dist/main.js"]
