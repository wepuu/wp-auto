# Frozen Connector test artifact

`wepuu-auto-connector.zip` is the original 0.1.0 `p3a7-pairing-scope`
artifact, copied byte-for-byte with operator approval, not rebuilt from HEAD.

SHA-256: `f59406eaa07c8d6d8518ef5d5d71cd496a7952fa781b263d7bc306ec5fd3d960`.

The archive retains its original LICENSE (GPL-2.0-or-later) and vendor licenses,
including Lcobucci JWT 4.3.0 (BSD-3-Clause). No production state is included.
Only synthetic keys are generated at test runtime. This directory and all
extracted files are excluded from OCI build contexts, not production plugins.

The runner loads the archive's Composer autoloader and unchanged signer.
The sole WordPress adapter is `wp_parse_url` delegating to PHP `parse_url` for
ordinary synthetic HTTPS URLs. This does not reproduce WordPress REST/FPM,
other plugins, opcache, production clock skew, or the historical failed proof.
