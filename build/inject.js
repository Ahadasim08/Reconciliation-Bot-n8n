import { readFileSync, writeFileSync } from 'node:fs';

export function injectCode(workflow, mappings) {
  const nodesByName = new Map(workflow.nodes.map((node) => [node.name, node]));

  for (const { nodeName, sourceFile } of mappings) {
    const node = nodesByName.get(nodeName);
    if (!node) {
      throw new Error(`inject.js: no node named "${nodeName}" in workflow`);
    }
    node.parameters.jsCode = readFileSync(sourceFile, 'utf8');
  }

  return workflow;
}

export function injectCodeFile(workflowPath, outputPath, mappings) {
  const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));
  injectCode(workflow, mappings);
  writeFileSync(outputPath, JSON.stringify(workflow, null, 2) + '\n');
}
