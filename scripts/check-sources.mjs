// Checks that every quoted source passage in a Markdown deliverable exists in the cited file.
// Citation line:  > "exact passage" — [label](relative/path.md)
// The path resolves from the deliverable's folder, then from the current folder (the repository root).
// Usage: node scripts/check-sources.mjs <file.md>...   Exit 1 on a missing passage, a missing
// source, or a file with no citations (research findings must carry their passages).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd(); // run from the repository root, as crucible.ps1 and the agents do
const cite = /^>\s*["“](.+)["”]\s*(?:—|–|--|-)\s*\[[^\]]*\]\(<?([^)#>]+)(?:#[^)>]*)?>?\)\s*$/;
const norm = (text) => text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

let failed = false;
const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/check-sources.mjs <file.md>...'); process.exit(2); }
for (const file of files) {
  const path = resolve(root, file);
  if (!existsSync(path)) { console.log(`FAIL ${file}: file not found`); failed = true; continue; }
  let count = 0;
  readFileSync(path, 'utf8').split(/\r?\n/).forEach((line, index) => {
    const match = cite.exec(line);
    if (!match) return;
    count++;
    const target = decodeURI(match[2].trim());
    const source = [resolve(dirname(path), target), resolve(root, target)].find(existsSync);
    if (!source) { console.log(`FAIL ${file}:${index + 1} source not found: ${target}`); failed = true; return; }
    if (!norm(readFileSync(source, 'utf8')).includes(norm(match[1]))) {
      console.log(`FAIL ${file}:${index + 1} passage not in ${target}: "${match[1].slice(0, 80)}"`);
      failed = true;
    }
  });
  if (!count) { console.log(`FAIL ${file}: no cited passages (> "passage" — [source](path))`); failed = true; }
  else console.log(`${file}: ${count} cited passage(s) checked`);
}
process.exit(failed ? 1 : 0);
