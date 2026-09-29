import assert from 'node:assert/strict';
import test from 'node:test';
import { MCP_ABILITY_SCOPE_POLICY, MCP_SCOPE_ORDER, McpScopeSetSchema } from '../src/index.js';

test('Phase 2.0.5 freezes one canonical scope for each ordered connector ability', () => {
  assert.equal(MCP_ABILITY_SCOPE_POLICY.length, 23);
  assert.equal(new Set(MCP_ABILITY_SCOPE_POLICY.map(([ability]) => ability)).size, 23);
  assert.deepEqual(
    [...new Set(MCP_ABILITY_SCOPE_POLICY.map(([, scope]) => scope))],
    MCP_SCOPE_ORDER
  );
  assert.equal(MCP_ABILITY_SCOPE_POLICY[0]?.[0], 'wp-auto/site-health');
  assert.equal(MCP_ABILITY_SCOPE_POLICY[22]?.[0], 'wp-auto/seo-update');
  assert.equal(McpScopeSetSchema.safeParse(MCP_SCOPE_ORDER).success, true);
});
