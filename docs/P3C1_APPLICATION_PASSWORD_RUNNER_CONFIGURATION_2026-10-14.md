# P3-C1: Explicit Application Password test-runner configuration

This is a code-integration adjustment after the accepted P3-B3 production run,
not a rerun or deployment. Historical acceptance files and their original
reviewed Head remain unchanged.

The runner no longer contains a default VPS address, SSH username or container.
All three non-secret values must be supplied explicitly in the operator's
environment before any SSH or HTTP operation can occur:

| Variable | Purpose |
|---|---|
| `WEPUU_P3B3_SSH_HOST` | Explicit DNS hostname or IPv4 address, no SSH options |
| `WEPUU_P3B3_SSH_USER` | Explicit authorized SSH user; no built-in root target |
| `WEPUU_P3B3_WORDPRESS_CONTAINER` | Exact owned Site B WordPress container |

Absent/empty values fail with `application_core_configuration_required`;
invalid values fail with `application_core_configuration_invalid`. SSH username
and hostname are separate process arguments; container/action/run are validated
before constructing the remote command. The destination resource remains the
bounded Site B HTTPS resource; this is not an arbitrary-site administration tool.

Even with configuration, explicit `--execute true` and a separate task-specific
authorization are required. Merely merging this code authorizes no production
run. No password, Cookie, nonce, Token, private key or credential-file path is
accepted in configuration. Existing Pageant/SSH authorization is not read or
copied by the script. The Core helper is streamed through stdin, not installed.

The original ten tests remain; six added offline tests cover required values,
injection rejection, no process invocation without configuration, separated SSH
arguments, inert default CLI execution and absence of the hardcoded target.
No test here makes a production request. Production's prior success remains
supported by its original evidence, not extrapolated to these new configuration
options as if they had been used during that run.

Explicit execution, one run-owned identity, Core exact credential deletion,
dependency-gated user removal, failure cleanup and secret-output suppression
remain unchanged. No OAuth/Connector/schema/authentication contract is modified.
Rollback is a code revert; it does not restore credentials or mutate production.
