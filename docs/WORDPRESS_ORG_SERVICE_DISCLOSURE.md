# WordPress.org External Service Disclosure

Status: architecture draft. Final publication requires real Terms of Service and Privacy Policy URLs, production hostnames, retention periods, and verified implementation behavior.

## Proposed readme disclosure

### WePuu Platform OAuth service

This plugin can optionally connect to the WePuu Platform OAuth service to let a site administrator pair this WordPress site and let individual WordPress users authorize compatible MCP clients through a browser.

The service is disabled by default. The plugin does not contact WePuu Platform when the plugin is installed or activated. Contact begins only after an authorized administrator reviews the disclosure and deliberately selects **Connect**.

When enabled, the plugin may send the following control information to WePuu Platform:

- the exact public WordPress MCP endpoint being paired;
- an opaque site identifier and protocol/plugin version;
- short-lived pairing and consent transaction proofs;
- opaque grant identifiers, approved OAuth scope names, and grant/revocation status;
- bounded delivery, security, and error metadata needed to operate pairing, token revocation, and key rotation.

The plugin and service do not send WordPress passwords or Application Passwords to WePuu Platform. MCP tool requests and responses travel directly between the MCP client and the WordPress site. The platform is not an MCP proxy and is not intended to receive posts, pages, media, taxonomy values, SEO data, email data, tool arguments, or tool results.

The service is provided by: **[legal provider name required]**

- Terms of Service: **[production URL required]**
- Privacy Policy: **[production URL required]**
- Service status/support: **[production URL required]**

Administrators can disconnect the service from the plugin settings. Users can revoke their local grants. Application Password access remains independent of the optional service.

## Admin consent copy requirements

Before the first outbound request, the WordPress UI must display in plain language:

- who provides the external service;
- why the site will contact it;
- the categories of data sent;
- that MCP content flows directly to the site, not through the platform;
- that access tokens identify an opaque grant but do not contain WordPress credentials or roles;
- how to revoke and disconnect;
- links to current Terms and Privacy documents.

Consent must not be bundled with plugin activation, dismissed permanently before a decision, or represented as required for the free connector's Application Password functionality.

## Privacy-policy suggestion

If you connect this site to WePuu Platform, the site exchanges limited account-control metadata with that service to pair the site, authorize users, validate signed access grants, and process revocation. This can include the site's public MCP endpoint, opaque site and grant identifiers, approved permission categories, protocol versions, timestamps, and security/error status. WordPress content and MCP tool payloads are designed to travel directly between your MCP client and this site rather than through WePuu Platform. Review the provider's Privacy Policy and Terms before enabling the connection.

Site owners must review this text against their own configuration, applicable law, retention choices, and any additional plugins that alter authentication or user status.

## Compliance gates

- The free plugin remains useful through direct Application Password authentication and is not trialware.
- No automatic call occurs on install, activation, update, wp-admin page load, cron, or public request before opt-in.
- No remote executable code is downloaded or run.
- External-service code and UI are inactive when disconnected.
- Service identity, purpose, sent data, Terms, and Privacy links are present in `readme.txt` before release.
- Actual traffic is captured in tests and compared to the disclosure field by field.
- Any future analytics, billing, hosted gateway, content processing, or new external service requires a new disclosure and consent review.

## Official guidance

- [WordPress.org Detailed Plugin Guidelines](https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/)
- [Common plugin review issues](https://developer.wordpress.org/plugins/wordpress-org/common-issues/)
- [Suggesting privacy-policy text](https://developer.wordpress.org/plugins/privacy/suggesting-text-for-the-site-privacy-policy/)
