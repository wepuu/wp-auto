# Phase 2.0.7B1 Compatibility Matrix

Matrix version: `2026-10-preview`.

| Client | Tested version | Registration path | Result |
|---|---:|---|---|
| Codex | 0.154.0 | Pre-registered Authorization Code, PKCE S256 | Supported |
| WorkBuddy GUI | 5.5.2 | Standard OAuth discovery and browser authorization | Unsupported |
| codebuddy | 2.137.1 | Standard OAuth discovery and browser authorization | Unsupported |

Unsupported clients are not made compatible by weakening PKCE, issuer,
audience, redirect URI or resource validation. New versions remain unverified
until the same real-client acceptance suite passes.
