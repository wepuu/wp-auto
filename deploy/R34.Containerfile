# Local-only: parent aliases are newly created and verified against fixed IDs.
ARG TEST_BASE
ARG AUTH_BASE
ARG CONTROL_BASE
FROM ${TEST_BASE} AS build
ARG WEPUU_SOURCE_REVISION
LABEL org.opencontainers.image.revision=$WEPUU_SOURCE_REVISION
WORKDIR /workspace
COPY apps ./apps
COPY packages ./packages
RUN pnpm clean && pnpm build --pretty false

FROM build AS test
CMD ["pnpm", "check"]

FROM ${AUTH_BASE} AS authorization
ARG WEPUU_SOURCE_REVISION
LABEL org.opencontainers.image.revision=$WEPUU_SOURCE_REVISION
COPY --from=build --chown=node:node /workspace/apps /workspace/apps
COPY --from=build --chown=node:node /workspace/packages /workspace/packages
USER node
CMD ["node", "apps/authorization-service/dist/main.js"]

FROM ${CONTROL_BASE} AS control
ARG WEPUU_SOURCE_REVISION
LABEL org.opencontainers.image.revision=$WEPUU_SOURCE_REVISION
COPY --from=build --chown=node:node /workspace/apps /workspace/apps
COPY --from=build --chown=node:node /workspace/packages /workspace/packages
USER node
CMD ["node", "apps/control-api/dist/main.js"]
