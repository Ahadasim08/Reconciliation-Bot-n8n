import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { injectCode } from '../build/inject.js';

const EXPORT_PATH = new URL('./fixtures/n8n-code-node-export.json', import.meta.url);
const MATCHER_PATH = new URL('../src/matcher.js', import.meta.url);

describe('injectCode', () => {
  it('writes a src file verbatim into the named Code node, staying valid JSON', () => {
    const workflow = JSON.parse(readFileSync(EXPORT_PATH, 'utf8'));
    const matcherSource = readFileSync(MATCHER_PATH, 'utf8');

    const result = injectCode(workflow, [
      { nodeName: 'Code in JavaScript', sourceFile: MATCHER_PATH },
    ]);

    // Round-trips through JSON.stringify/parse the way `npm run build` will.
    const roundTripped = JSON.parse(JSON.stringify(result));
    const node = roundTripped.nodes.find((n) => n.name === 'Code in JavaScript');

    expect(node.parameters.jsCode).toBe(matcherSource);
    expect(node.type).toBe('n8n-nodes-base.code');
    // Everything else on the node is untouched.
    expect(node.typeVersion).toBe(2);
  });

  it('throws if the target node name does not exist', () => {
    const workflow = JSON.parse(readFileSync(EXPORT_PATH, 'utf8'));
    expect(() =>
      injectCode(workflow, [{ nodeName: 'Nonexistent Node', sourceFile: MATCHER_PATH }])
    ).toThrow(/no node named/);
  });
});
