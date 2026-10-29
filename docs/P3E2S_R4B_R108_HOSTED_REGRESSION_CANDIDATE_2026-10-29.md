# R108: fixed PostgreSQL preparation candidate for one Hosted regression

Parent1349f468a7d646dae6330569f61365799fa36939; existing Draft PR104.
R92 failed before matrix execution. R93 preparation/diagnostics and R107
identity compatibility are the submitted continuation, not prior Hosted passes.

Submission includes only explicit workflow/matrix/contract changes,PostgreSQL
gate/executor/preparation/pin,R107 synthetic tests,and bounded evidence records.
R101 document/result are runtime dependencies of schema2 provenance checks;
their exact paths have -text attributes to preserve original-byte SHA256.
Other historical tools,private backups,live launchers and ledgers are excluded.

New Hosted step runs offline identity contracts before explicit preparation.
Preparation may pull only the pinned linux/amd64 manifest; matrix retains
--pull=never. Runtime startup does not migrate. Candidate profile excludes014;
014 remains limited to authorized disposable legacy regression databases.
Node24.22.1,pnpm11.19.0,locks and20minute Hosted deadline are unchanged.

Gate runs on the Hosted host and reads checked-out evidence. Root test discovery
does not invoke R107 synthetic tests inside the test image. Docker context
still excludes docs; no Containerfile/context expansion is required.
One ordinary appended commit/push is intended, no rerun/dispatch/patch push.
Final run/head/coverage outcome is recorded separately without another push.

Local proof is limited to offline contracts,syntax and staged-export checks;
it does not replace dependency installation,strict checks,OCI,matrix,signing,
backup,PHP,audit,SBOM or conformance stages on the Hosted runner.
No public API,product type,OAuth/Refresh contract or production config changes.
No production deployment,merge or real OAuth/MCP is authorized.
