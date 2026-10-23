# Existing-image-only Authorization revalidation

`revalidate-authorization-artifact.mjs` is deliberately separate from the build entrypoint. It can inspect only the retained R2 tag/immutable image and perform a fixed network-disabled version/LTS/UID probe. It cannot build, pull, load, push, retag, run Authorization main or invoke another client. A missing artifact/evidence is a terminal failure, not a trigger to recreate it.

After explicit bounded authorization, use a clean committed verifier with an absolute Docker executable, verified local context and its expected **verifier** revision:

```text
node scripts/revalidate-authorization-artifact.mjs --docker <absolute-Docker-executable> --context desktop-linux --verifier-revision <40-character-verifier-commit>
```

The retained image remains attributed to build revision `a3aaf70780adc93aadba030716e61ed9648a00df`; the tool must not demand its label equal a later verifier revision. The expected tag, OCI index identity and R2 evidence directory are fixed-purpose constants. Application/dependency/Containerfile inputs are compared against the original build commit before and after the operation.

Original receipt, build-process result, IID and metadata are read without modification; regular-file and private permission checks precede reads. Input hashes are recorded as a **new** observation, not retrospective historical attestations. Tag and immutable-ID inspections must agree under the repaired typed-descriptor contract. Existing failure records remain unchanged.

Windows permission checks use a bounded child PowerShell process calling CLR ACL APIs directly, not module-autoloaded cmdlets. A dedicated Windows temporary-fixture test covers the real child transport with an empty module path, private access acceptance and broad-access rejection. Failed ACL reads are `R3_ACL_READ_NOT_CONFIRMED`, not proof that access is non-private. The fixture is independent of retained R2 evidence and performs no image verification.

Only after linkage passes, one15-second probe overrides the entrypoint with Node on the immutable image ID, `--pull=never`, `--network none`, read-only filesystem, no healthcheck, no added capabilities or privileges, no mounts, credentials or published ports. It reads only Node version/LTS/UID. Normal image service startup is not exercised. Finally handles only the uniquely labeled probe container; no global cleanup is permitted.

Safe results and hashes go to a new protected `.tmp/authorization-revalidation/` directory. No raw metadata, build log, provenance, environment or user configuration is copied there. Docker operations are a closed set in `authorization-revalidation.mjs` and are recorded by operation name. Failed stages stop without a retry. No database, OAuth, MCP, production or Hosted CI follows success automatically.

Pure synthetic tests: `node --test scripts/authorization-build-contract.test.mjs scripts/authorization-revalidation.test.mjs`. They perform no Docker call. Fixed Node24 container testing and the actual retained-image probe are separate evidence.
