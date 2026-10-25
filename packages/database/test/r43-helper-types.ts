import type { Pool } from 'pg';
import { expectedLedger, recordFixtureLedger } from './r17-migration-evidence.mjs';
import { nativeFixturePayload, fixtureParent } from './reconsent-native-fixture.mjs';
import { recordOtpLedger } from './otp-migration-evidence.mjs';
import { recordTargetLedger } from './r19-target-ledger.mjs';
import { createDiagnostic, safeError } from './reconsent-diagnostic.mjs';
declare const pool: Pool;
void recordFixtureLedger(pool, 'before', 'candidate');
void expectedLedger('historical14');
void recordOtpLedger(pool, 'after');
void recordTargetLedger(pool, 'before');
const binding = {grantId:'g',accountId:'a',clientId:'c',resource:'https://site.example.test/mcp',sessionUid:'s'};
const payload = nativeFixturePayload(binding);
const kind: 'RefreshToken' = payload.kind;
void kind;
// @ts-expect-error Unsupported profile must not become an unrestricted string.
void expectedLedger('production');
// @ts-expect-error Ledger stage is closed.
void recordFixtureLedger(pool, 'unknown', 'candidate');
// @ts-expect-error Required fixture binding fields cannot be omitted.
nativeFixturePayload({ grantId:'g' });
// @ts-expect-error Only code/refresh fixture parents are supported.
fixtureParent({candidates:()=>[]}, 'AccessToken', 'id');
const diagnostic = createDiagnostic({run:'r18-43',save:() => Promise.resolve()});
diagnostic.checkpoint('SETUP');
// @ts-expect-error Diagnostic stages are closed.
diagnostic.checkpoint('SECRET_STAGE');
const category = safeError(new Error()).category;
// @ts-expect-error Safe diagnostics do not expose arbitrary error messages.
const raw = safeError(new Error()).message;
void category; void raw;
