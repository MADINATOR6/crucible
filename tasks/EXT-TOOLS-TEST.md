# EXT-TOOLS-TEST: the external-tools inventory test knows about mpt

Pre-existing failure (seen 2026-11-26 at b794cd8 and later): `scripts/test-external-tools.ps1` expects 7 inventory rows, but `check-external-tools.ps1` has reported 8 since MoneyPrinterTurbo (`mpt`, e66d426); its first check also left mpt's real install visible. Fix: point `CRUCIBLE_MPT_DIR` at a missing folder in both checks (mpt reports unavailable, independent of this machine) and expect 8 rows; every other assertion unchanged.

Write allowlist: `scripts/test-external-tools.ps1`. Done When: the suite exits 0 (Claude), reviewed by Codex.
