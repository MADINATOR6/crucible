# UPGRADE-1T correction round (tests-first step 1, one correction)

Do this now: fix one defect in your own test case, run the suite, report. Follow HANDOFF.md, Implementer instruction. Write allowlist: `scripts/test-ccx-ops.ps1` only. Do not change what any test asserts.

The implementation (commit 18b208b on this branch) registers `{ "name": "symmetry", "builtin": "instruction-symmetry", "quick": true }`. Your case `Instruction symmetry stage` now fails before its assertions:

`FAIL Instruction symmetry stage: Exception calling "Serialize" with "1" argument(s): "A circular reference was detected while serializing an object of type 'System.Management.Automation.PSParameterizedProperty'."`

Cause (Claude's diagnosis, confirm it): `$registered = @( (Read-Json $sourcePolicy).verify.stages | Where-Object ... )` emits each dictionary through the pipeline wrapped in a PSObject; `$policy.verify.stages += $registered[0]` then `Save-Policy` hands that wrapper to JavaScriptSerializer. Unwrap it (for example `$registered[0].psobject.BaseObject`, or index the array without the pipeline) so the fixture policy holds a plain dictionary.

Done When: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-ccx-ops.ps1` exits 0 (all cases, or SKIP only where taskkill is denied). Report per HANDOFF.md Report format with `Untested:`.
