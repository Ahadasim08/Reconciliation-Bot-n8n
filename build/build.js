import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { injectCodeFile } from './inject.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const driver = (name) => readFileSync(join(here, 'drivers', name), 'utf8');

injectCodeFile(
  join(root, 'workflow/workflow.template.json'),
  join(root, 'workflow/workflow.json'),
  [
    { nodeName: 'Normalize', sourceFile: join(root, 'src/normalize.js'), driver: driver('normalize.driver.js') },
    { nodeName: 'Match', sourceFile: join(root, 'src/matcher.js'), driver: driver('match.driver.js') },
    { nodeName: 'Classify', sourceFile: join(root, 'src/classify.js'), driver: driver('classify.driver.js') },
    { nodeName: 'Format', sourceFile: join(root, 'src/format.js'), driver: driver('format.driver.js') },
  ]
);

console.log('workflow/workflow.json written.');
