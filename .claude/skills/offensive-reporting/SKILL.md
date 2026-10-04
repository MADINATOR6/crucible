---
name: offensive-reporting
description: Write or review reports for authorized security findings with clear scope, redacted evidence, concrete impact, remediation and verifiable retest criteria.
---

# Security finding reports

Use this skill to document a requested, authorized review or engagement. Follow the task's scope, exclusions and authorization, AGENTS.md and ccx gates. Report writing does not authorize further testing or delivery to another person.

## Finding format

For each finding, include:

- **Title and affected scope:** identify the component, version, path/line or endpoint, and relevant preconditions.
- **Severity and impact:** explain the concrete consequence and confidence. If CVSS is requested, justify the chosen metrics using the applicable specification; do not substitute a generic example score for evidence.
- **Root cause and reproduction:** describe what went wrong, the minimal authorized local reproduction, and expected versus observed results.
- **Evidence:** record the command or test, outcome, UTC timestamp and relevant artifact pointer. Preserve enough evidence for independent verification without copying confidential data into the report.
- **Remediation:** specify the code or configuration correction, with secondary controls only when useful.
- **Retest:** state the exact check and expected result; label fixed, partially fixed or unverified based on actual evidence.

## Evidence and readability

Replace credentials with clear placeholders. Exclude personal data; inspect screenshots and URLs for tokens, unrelated tabs and private paths. Curate relevant output instead of dumping logs. Never send a report, wipe evidence or change retention settings without the applicable authorization.

Keep tested scope, limitations and assumptions distinct. Separate observed facts from hypotheses and explicitly name missing verification. For an executive audience, lead with business consequences and prioritized recommendations; draft that summary after the technical findings. For a small repository review, a concise findings list is enough—do not generate every engagement-report section or output format by default.

## Provenance and adaptation

Adapted from [Claude-Red offensive reporting](https://github.com/SnailSploit/Claude-Red/blob/739512a8588b28ff3b554e669391c22508602878/Skills/utility/offensive-reporting/SKILL.md), commit `739512a8588b28ff3b554e669391c22508602878`.

Local changes: shortened the description and body to the finding template, evidence hygiene, scope/limitations and retest principles useful to this workflow. Omitted attack narratives, example CVSS scores, retention/deletion commands, publishing and document-tool installation. No supporting executable or external skill is required.

Copyright (c) 2024-2025 SnailSploit / Kai Aizen. MIT license: [LICENSE](LICENSE).
