# P2 Email OTP production correction - 2026-10-11

## Scope

This record covers the production correction required for native Email OTP
form submissions. It does not change the OAuth issuer, PKCE, consent, token,
JWKS, tenant/site/grant isolation, connector, direct WordPress data plane or
Application Password fallback.

## Confirmed failure

The deployed server-rendered login page returned
`Referrer-Policy: no-referrer` while the POST handlers required an exact
`Origin`. The Fetch standard serializes the `Origin` of a non-CORS POST as
`null` under that policy. A bounded production diagnostic confirmed the
browser request was `Sec-Fetch-Site: same-origin`, carried the CSRF cookie and
sent `Origin: null`. Resend was not called. The temporary diagnostic logged no
IP address, email, Cookie value, form body or OTP and was removed after the
observation.

This behavior was checked against the WHATWG Fetch standard and the pinned
Better Auth 1.7.7 `origin-check` implementation. Better Auth itself recognizes
`Origin: null` plus `Sec-Fetch-Site: same-origin` as the native-form case and
infers the request-target origin before applying `trustedOrigins`; the earlier
WePuu exact-Origin gate was the component returning the observed 403.

## Correction and security behavior

Server-rendered control pages now return `Referrer-Policy: same-origin`.
Same-origin native POSTs therefore retain the exact tuple `Origin` required by
the existing CSRF gate. Cross-origin form submissions still serialize an
untrusted or null Origin and fail closed. The double-submit CSRF value,
`SameSite=Lax` cookies, method/content-type checks and bounded login
transaction remain unchanged; no Origin fallback or allow-list expansion was
added.

Cookie lookup also no longer treats the aggregate Cookie header as one 4 KiB
cookie. Node/Fastify retain the transport request-header bound, while the
parser can locate the target CSRF cookie alongside unrelated legacy cookies.

## Validation

- The focused Email OTP test covers a 4 KiB unrelated legacy cookie and the
  `same-origin` response policy.
- Better Auth Email OTP options and request handling were checked against the
  official 1.7.7 source, including hashed OTP storage, attempt limits, handler
  rate limiting and origin validation.
- Resend behavior was checked against the official 6.32.1 SDK example and
  request-options contract. An API response ID means the request was accepted;
  it is not recorded as inbox delivery, and a timeout remains an unknown send
  outcome.
- `pnpm check` must pass before merge and deployment.
- Hosted pull-request and post-merge CI must pass before publishing an
  immutable control image.
- Production rollout is limited to `wpauto-control` and uses the existing
  health-checked automatic rollback command.
- A real browser Email OTP send, verification, account bootstrap and OAuth
  interaction resume remain required before this production correction is
  marked accepted.

## Data-flow review

The correction changes only browser metadata on control-plane HTML responses.
No WordPress content, MCP input or MCP output enters the platform, and the
connector is unchanged.

## Primary references

- [WHATWG Fetch standard](https://fetch.spec.whatwg.org/)
- [Better Auth 1.7.7 Email OTP source](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/plugins/email-otp/index.ts)
- [Better Auth 1.7.7 origin-check source](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/api/middlewares/origin-check.ts)
- [Resend Node.js SDK 6.32.1](https://github.com/resend/resend-node/blob/v6.32.1/readme.md)
