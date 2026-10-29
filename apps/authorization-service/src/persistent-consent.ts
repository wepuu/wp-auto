import { randomBytes } from 'node:crypto';
import { escapeHtml } from '@wepuu/platform-ui';
import { interactionSubmissionHeaderRejection, signCsrf, verifyCsrf } from './server.js';

interface Binding {
  readonly subjectId: string; readonly tenantId: string; readonly siteId: string;
  readonly grantId: string; readonly clientId: string; readonly resource: string;
  readonly scopes: readonly ['mcp:read'];
}
interface Options {
  readonly policy?: Readonly<{ allowsNewAuthorization: boolean; assertNewAuthorization(): void }>;
  readonly origin: string;
  readonly csrfKey: string;
  /** Must derive from authenticated session + verified Provider interaction, not form fields. */
  resolve(interactionUid: string, accountId: string): Promise<Binding | undefined>;
  approve(input: Binding & { readonly id: string; readonly interactionUid: string; readonly explicitApproval: true }): Promise<unknown>;
}
const denied = (): never => { throw new Error('persistent_consent_denied'); };

/** Explicit persistent choice bound to the current authenticated Provider interaction. */
export class PersistentConsentController {
  readonly #options: Options;
  readonly #policy: NonNullable<Options['policy']>;
  constructor(options: Options) {
    this.#options = options;
    this.#policy = options.policy ?? Object.freeze({ allowsNewAuthorization: false,
      assertNewAuthorization: (): never => denied() });
    const origin = new URL(options.origin);
    if (origin.protocol !== 'https:' || origin.origin !== options.origin || options.csrfKey.length < 32) return denied();
  }
  async #binding(uid: string, accountId: string): Promise<Binding> {
    if (!/^[A-Za-z0-9_-]{8,256}$/u.test(uid) || !/^[A-Za-z0-9_-]{8,128}$/u.test(accountId)) return denied();
    const binding = await this.#options.resolve(uid, accountId);
    const scopes: unknown = binding?.scopes;
    if (binding === undefined || binding.subjectId !== accountId
      || !Array.isArray(scopes) || scopes.length !== 1 || scopes[0] !== 'mcp:read'
      || !binding.resource.startsWith('https://')) return denied();
    return binding;
  }
  async fields(uid: string, accountId: string): Promise<string> {
    const binding = await this.#binding(uid, accountId);
    const csrf = signCsrf({ uid, accountId, grantId: binding.grantId,
      expiresAt: Math.floor(Date.now() / 1000) + 300, nonce: randomBytes(24).toString('base64url') }, this.#options.csrfKey);
    const persistentChoice = this.#policy.allowsNewAuthorization
      ? '<label><input type="checkbox" name="persistent" value="approve-readonly-persistent">Allow read-only access after browser logout</label><p>Persistent access can outlive the browser session. Disconnect/revoke access separately to end authorization. Existing lifetime and revocation limits still apply.</p>'
      : '<p>New persistent authorization is unavailable. Ordinary session-bound access remains available.</p>';
    return `<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">${persistentChoice}`;
  }
  async render(uid: string, accountId: string): Promise<string> {
    return `<form method="post" action="/interaction/${encodeURIComponent(uid)}"><h2>Read-only access</h2>${await this.fields(uid, accountId)}<button name="decision" value="approve">Approve access</button><button name="decision" value="deny">Deny</button></form>`;
  }
  async submit(uid: string, accountId: string, headers: Readonly<{
    method: string | undefined; contentType: string | undefined; origin: string | undefined;
  }>, form: URLSearchParams): Promise<Readonly<{ approved: boolean; persistent: boolean }>> {
    try {
      if (interactionSubmissionHeaderRejection({ ...headers, expectedOrigin: this.#options.origin }) !== undefined) return denied();
      const binding = await this.#binding(uid, accountId);
      if (form.getAll('csrf').length !== 1 || form.getAll('decision').length !== 1
        || form.getAll('persistent').length > 1
        || [...form.keys()].some(key => !['csrf', 'decision', 'persistent'].includes(key))) return denied();
      const csrf = verifyCsrf(form.get('csrf') ?? '', this.#options.csrfKey);
      if (csrf === undefined || csrf.uid !== uid || csrf.accountId !== accountId || csrf.grantId !== binding.grantId) return denied();
      const choice = form.get('decision');
      if (choice === 'deny') return { approved: false, persistent: false };
      if (choice !== 'approve') return denied();
      const persistent = form.get('persistent');
      if (persistent === null) return { approved: true, persistent: false };
      if (persistent !== 'approve-readonly-persistent') return denied();
      this.#policy.assertNewAuthorization();
      await this.#options.approve({ ...binding, id: `receipt_${randomBytes(24).toString('hex')}`,
        interactionUid: uid, explicitApproval: true });
      return { approved: true, persistent: true };
    } catch { return denied(); }
  }
}
