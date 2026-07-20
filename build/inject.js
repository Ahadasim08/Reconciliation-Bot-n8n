import { readFileSync, writeFileSync } from 'node:fs';

// n8n's Code node sandbox is not a module context -- `export` is a syntax
// error there. src/*.js files use `export function` so Vitest can import
// them; strip the keyword before it lands in a Code node.
function stripExports(source) {
  return source.replace(/^export\s+/gm, '');
}

export function injectCode(workflow, mappings) {
  const nodesByName = new Map(workflow.nodes.map((node) => [node.name, node]));

  for (const { nodeName, sourceFile, driver } of mappings) {
    const node = nodesByName.get(nodeName);
    if (!node) {
      throw new Error(`inject.js: no node named "${nodeName}" in workflow`);
    }
    const source = stripExports(readFileSync(sourceFile, 'utf8'));
    node.parameters.jsCode = driver ? `${source}\n${driver}` : source;
  }

  return workflow;
}

export function injectCodeFile(workflowPath, outputPath, mappings) {
  const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));
  injectCode(workflow, mappings);
  writeFileSync(outputPath, JSON.stringify(workflow, null, 2) + '\n');
}
