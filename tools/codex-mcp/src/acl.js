// Owner-only check for the token file, by SID (names are localized and not unique).
// Allowed: the current user, SYSTEM (S-1-5-18) and BUILTIN\Administrators (S-1-5-32-544).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const SYSTEM_SID = 'S-1-5-18';
const ADMINS_SID = 'S-1-5-32-544';
const sys32 = (exe) => join(process.env.SystemRoot || 'C:\\Windows', 'System32', exe);

export function currentUserSid(exec = execFileSync) {
  const out = String(exec(sys32('whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true }));
  const sid = /"(S-1-[0-9-]+)"/.exec(out);
  if (!sid) throw new Error('could not read the current user SID');
  return sid[1];
}

// Each entry: { sid, type: 'Allow' | 'Deny' }. The path travels in an environment variable, never in the script text.
export function readAclEntries(path, exec = execFileSync) {
  const script = "$ErrorActionPreference='Stop'; (Get-Acl -LiteralPath $env:CMCP_ACL_PATH).Access | ForEach-Object { try { $s = $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { $s = 'UNRESOLVED' }; $s + '|' + $_.AccessControlType }";
  const out = String(exec(sys32('WindowsPowerShell\\v1.0\\powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, CMCP_ACL_PATH: path }
  }));
  return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const [sid, type] = line.split('|');
    return { sid, type };
  });
}

// Exposed when any Allow entry names someone other than the owner, SYSTEM or Administrators,
// or when the owner has no entry at all (the list could not be read correctly).
export function aclExposed(entries, userSid) {
  const allowed = new Set([userSid, SYSTEM_SID, ADMINS_SID]);
  const allows = entries.filter((e) => e.type === 'Allow');
  if (!allows.some((e) => e.sid === userSid)) return true;
  return allows.some((e) => !allowed.has(e.sid));
}

export function makePrivate(path, userSid, exec = execFileSync) {
  exec(sys32('icacls.exe'), [path, '/inheritance:r', '/grant:r', `*${userSid}:F`], { windowsHide: true, stdio: 'ignore' });
}
