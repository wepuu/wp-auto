/** Immutable, trusted, per-instance policy. Not a distributed writer fence. */
export class PersistentAuthorizationPolicy {
  readonly #mode: 'guard-only' | 'explicit-consent';
  constructor(mode: unknown = 'guard-only') {
    if (mode !== 'guard-only' && mode !== 'explicit-consent') throw new Error('invalid_persistent_policy_mode');
    this.#mode = mode;
    Object.freeze(this);
  }
  get allowsNewAuthorization(): boolean { return this.#mode === 'explicit-consent'; }
  assertNewAuthorization(): void {
    if (!this.allowsNewAuthorization) throw new Error('persistent_authorization_closed');
  }
}
