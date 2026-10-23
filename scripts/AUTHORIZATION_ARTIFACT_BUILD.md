# Bounded local Authorization artifact gate

This helper builds **one** Authorization release image, explicitly loads it into a verified local Docker daemon, and verifies its artifact identity. It does not run the service, migrations, database tests, OAuth, WordPress, MCP or Hosted CI. It never pushes an image or automatically retries. Use only after the operator authorizes a bounded build.

Run from a clean, committed candidate with an absolute Docker executable path, a verified existing local context/builder and the exact expected full commit:

```text
node scripts/build-authorization-artifact.mjs --docker <absolute-docker-executable> --context <local-context> --builder <verified-builder> --revision <40-character-commit>
```

The helper does not create/select a global builder or change global Docker settings. It excludes ambient Docker endpoint/builder overrides from its child-process environment. Only a single running `docker` or `docker-container` node on the selected local context/endpoint is permitted. Unknown or remote builders fail closed.

The single-platform build uses explicit `--load`, an independent `--iidfile`, build metadata and a fresh nonce-based tag. Exit0 is **not** artifact acceptance: image lookup, revision, platform, non-root release user, direct main CMD, known base-image entrypoint and metadata/config/manifest/IID association must pass. Manifest and config digests need not be equal. A preexisting target tag is refused. The source and builder identity are compared before and after the bounded operation.

The optional-in-design runtime probe is included by this fixed-purpose entrypoint: it overrides the image entrypoint with Node, disables network and health checks, and reads only version/LTS/UID. It does not execute Authorization main. The probe container is owned and cleaned up by nonce; the image is retained. Build timeout is15 minutes. A failed/uncertain gate stops the entrypoint without a rebuild or automatic cache/builder changes.

Private logs, invocation, IID, raw metadata and result files are written to a new protected directory under `.tmp/authorization-artifacts/`. Windows inheritance is restricted to the current user, SYSTEM and administrators; POSIX directory/file modes are0700/0600. Do not upload that directory. Only reviewed safe result fields belong in validation documentation. Raw build logs are retained privately so exporter evidence is not lost again; they are not printed in chat or exported as CI artifacts.

The contract unit tests use synthetic metadata/builders/images and contain no Docker call. Run `node --test scripts/authorization-build-contract.test.mjs`. This is distinct from a successful real image build and from later database/A-B acceptance.
