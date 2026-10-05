import assert from 'node:assert/strict';

export interface FaultClock {
  now(): Date;
}

export class ManualFaultClock implements FaultClock {
  #current: Date;

  constructor(initial: Date) { this.#current = new Date(initial); }
  now(): Date { return new Date(this.#current); }
  advance(milliseconds: number): Date {
    this.#current = new Date(this.#current.getTime() + milliseconds);
    return this.now();
  }
}

/** Deterministic, named failures for transport and custody seams in tests. */
export class FailureInjector {
  readonly #remaining = new Map<string, number>();

  fail(name: string, times = 1): void {
    if (!/^[a-z][a-z0-9_.-]{2,63}$/u.test(name) || !Number.isSafeInteger(times) || times < 1) {
      throw new Error('fault_name_invalid');
    }
    this.#remaining.set(name, times);
  }

  trip(name: string): boolean {
    const remaining = this.#remaining.get(name) ?? 0;
    if (remaining < 1) return false;
    if (remaining === 1) this.#remaining.delete(name);
    else this.#remaining.set(name, remaining - 1);
    return true;
  }
}

export function assertContentFreeEvidence(value: unknown): void {
  const serialized = JSON.stringify(value);
  assert.equal(typeof serialized, 'string');
  assert.doesNotMatch(serialized, /Bearer\s+[A-Za-z0-9._~-]{16,}/u);
  assert.doesNotMatch(serialized, /(?:cookie|token|secret|password|content|tool[_ -]?input|tool[_ -]?output)/iu);
}
