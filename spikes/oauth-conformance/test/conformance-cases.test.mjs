import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFORMANCE_CASES, CONFORMANCE_CASE_IDS, caseById } from '../src/conformance-cases.mjs';

test('provider-neutral suite exposes the complete P01–P12/N01–N16 catalog', () => {
  assert.equal(CONFORMANCE_CASES.length, 28);
  assert.deepEqual(CONFORMANCE_CASE_IDS, [
    'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12',
    'N01', 'N02', 'N03', 'N04', 'N05', 'N06', 'N07', 'N08', 'N09', 'N10', 'N11', 'N12', 'N13', 'N14', 'N15', 'N16'
  ]);
  assert.equal(caseById('P06').description, 'Exact RFC 8707 resource and single audience');
  assert.throws(() => caseById('pending'), /unknown_conformance_case/);
});
