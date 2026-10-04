---
name: offensive-bug-identification
description: Review authorized repository code for security bugs by tracing inputs, validation, authorization and state changes; produce reproducible findings with remediation and retest criteria.
---

# Authorized code review

Use this skill for a requested security review of repository code. Read the task's named scope, exclusions and authorization first. Installation does not authorize testing an external system. Follow AGENTS.md, file ownership and ccx gates.

## Review method

1. Identify the relevant version, dependencies, configuration and entry points. Enumerate how inputs reach the component, including files, command arguments and network requests where relevant.
2. Trace controllable data through validation and normalization to sensitive operations. Check authorization at the operation itself and across state transitions. Inspect length/allocation arithmetic, conversions, path handling and failure paths where applicable.
3. Compare the relevant changed code with its callers and prior behavior. For a suspected bug, separate observed behavior from a hypothesis; do not invent a vulnerability from a dangerous function name alone.
4. Prefer a small local test using synthetic data and the existing test facilities. Dynamic tests or fuzzing require the task's explicit scope and authorization. Exploit development, evasion, payloads, external scanning and tool installation are outside this adaptation.
5. Report each substantiated finding with affected path/line, trigger, expected versus actual behavior, impact, redacted evidence, a specific remediation and a retest criterion. Mark unverified claims UNKNOWN and state the check needed to resolve them.

For crash triage, distinguish invalid access and object lifetime problems from integer truncation, unexpected state transitions and uninitialized reads. Use available diagnostic evidence; do not claim exploitability without proof.

## Provenance and adaptation

Adapted from [Claude-Red bug identification](https://github.com/SnailSploit/Claude-Red/blob/739512a8588b28ff3b554e669391c22508602878/Skills/fuzzing/offensive-bug-identification/SKILL.md), commit `739512a8588b28ff3b554e669391c22508602878`.

Local changes: added matching YAML frontmatter; retained the input mapping, static review, crash triage and evidence principles as a concise code-review workflow. Omitted exploit/weaponization steps, target catalogs, external tool commands and links to uninstalled attack material. No supporting executable or external skill is required. The full upstream source is staged outside the repo, not loaded by this skill.

Copyright (c) 2024-2025 SnailSploit / Kai Aizen. MIT license: [LICENSE](LICENSE).
