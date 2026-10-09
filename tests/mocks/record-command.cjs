const fs = require('node:fs');
const path = require('node:path');
const [command, ...args] = process.argv.slice(2);
const skillIndex = args.indexOf('--append-system-prompt-file');
const record = {
  command, args, cwd: process.cwd(),
  codexHome: process.env.CODEX_HOME,
  project: process.env.OMO_CODEX_PROJECT,
  path: process.env.PATH,
  skill: skillIndex < 0 ? null : fs.readFileSync(args[skillIndex + 1], 'utf8'),
};
if (process.env.CRUCIBLE_MOCK_LOG) fs.writeFileSync(process.env.CRUCIBLE_MOCK_LOG, JSON.stringify(record));
if (args.includes('--version')) console.log(`${command} mock version`);
if (args.includes('--help')) console.log(`${command} mock help`);
process.exit(Number(process.env.CRUCIBLE_MOCK_EXIT || 0));
