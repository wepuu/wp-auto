# Existing-account continuous OTP: deployment gate stop

## Authorization and unchanged scope

The operator approved deploying the validated CI archive without registry
publication: recreate only Control, normally reload Nginx, keep existing-account
OTP available, prevent signup, retain quotas and close sending before rollback.
No email, OAuth, MCP, migration or WordPress operation was authorized here.

Candidate source remains `69e94218c946fc620af71bfca750657465a9f26c`, from
[successful CI 39538026057](https://github.com/wepuu/wp-auto/actions/runs/39538026057).
The downloaded archive SHA-256 was verified locally as
`92eea1aafb5c84565e049d52d201eea924913e5a8c6934ce0628e8abeff6035f`.
Its image ID is
`sha256:8ea1dc31e9d2e7019a4fb0a1ade409c1a5fa4e40d9844e2d573ae3c7159c693d`;
this is not a published registry digest.

## Actual stop and bounded evidence

The single preparation attempt returned `HOST_OOM_DRIFT` before backup creation,
file transfer or production configuration changes. The new local deployment
helper had retained the older absolute host `oom_kill` count of 174. That
historical constant is not evidence of the current deployment window's OOM rate.
The failed attempt and its single-use marker remain preserved; it was not reset
or silently rerun.

Direct SSH read-only observation at `2026-10-21T04:38:48.299377+00:00` found:

| Observation | Value |
| --- | --- |
| Host cumulative `oom_kill` | 175 |
| MemAvailable | 860548 KiB |
| memory full avg10 | 0.10 |
| Existing resource thresholds | at least 524288 KiB; full avg10 below 1 |
| Resource values at this observation | Within thresholds |

A separate bounded snapshot found all five existing containers healthy, no
container OOMKilled flag, restart counts zero and their IDs unchanged. These
container facts do not explain the host counter increment.

The current-boot, last-two-hours kernel journal read reached its 400-entry cap.
No matching OOM/allocation category appeared within those returned entries, but
the truncation prevents an absence conclusion. A source-filtered bounded query
returned `NOT_CONFIRMED`; no raw error or message was exported. The time and
cause of the additional cumulative OOM remain unconfirmed. No historical root
cause investigation or resource tuning was performed.

## Final scene and limitation

- No protected deployment backup was created by this attempt.
- No artifact was transferred to production or loaded into production Docker.
- No runtime configuration, ingress guard or business data was modified.
- Control recreation count: zero; Nginx reload count: zero.
- The last direct snapshot still showed sending disabled and the original
  ingress guard hash unchanged. Continuous OTP availability is **not deployed**.
- No email was sent and no OAuth/MCP action occurred.
- Existing image and CI acceptance remain candidate evidence, not deployment
  acceptance.

The host counter was not silently rebased to 175. A subsequent deployment
requires resolution or an explicitly reviewed treatment of this current gate;
any corrected helper must retain contemporaneous metrics, use a defined fresh
observation window, and reject new OOM events within that window. This record
does not authorize that next attempt or any resource/service changes.

```text
OTP_EXISTING_ACCOUNT_CONTINUOUS_LOGIN_DEPLOYED=False
OTP_EXISTING_ACCOUNT_DEPLOYMENT_GATE_PASS=False
OTP_EXISTING_ACCOUNT_DEPLOYMENT_CONFIGURATION_CHANGED=False
P3_FULL_ACCEPTANCE_PASS=False
READY_FOR_CONTROLLED_USE=False
NOT_READY_FOR_PUBLIC_REGISTRATION=True
```
