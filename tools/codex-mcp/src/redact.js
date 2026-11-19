// Pattern-based secret redaction for text leaving the bridge. Defence in depth only: it cannot
// recognise confidential prose, and anything sent to Codex has already reached the model provider.
//
// Every pattern starts at a literal or keyword (no leading wildcard) and every repeat is bounded,
// so a failed attempt costs at most a few hundred steps and long hostile text stays near-linear
// (CMCP-SEC-1, Codex round 3: unbounded patterns stalled the event loop on 60 kB of 'a').
// ponytail: values are capped at 1024 characters; a longer unseparated secret keeps its tail.

const KEY = '(?:api[_ -]?key|secret|password|passwd|pwd|passphrase|token|access[_-]?key|private[_-]?key|signing[_-]?key|encryption[_-]?key|client[_-]?key|credential)';

const PATTERNS = [
  /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]{0,40}PRIVATE KEY-----|$)/g,
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,512}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,255}/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,255}/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,255}/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,512}\.eyJ[A-Za-z0-9_-]{10,8192}\.[A-Za-z0-9_-]{10,1024}/g,
  /\b((?:Bearer|Basic)[ \t]{1,10})[A-Za-z0-9._~+/=-]{8,1024}/gi,
  /\b((?:Set-)?Cookie:[ \t]{0,10})[^\r\n]{1,4096}/gi,
  // user:password@ in URLs (postgres://admin:...@host)
  /\b([a-z][a-z0-9+.-]{0,30}:\/\/[^\s:/@]{1,256}:)[^\s@/]{3,1024}(?=@)/gi,
  // YAML block values: "password: |" followed by indented lines
  // Each line is one indent character then the rest: no two repeats can claim the same spaces,
  // so a failed match backtracks linearly (Codex round 3b: '[ \t]+[^\r\n]*' went quadratic).
  new RegExp(`(${KEY}[\\w-]{0,40}["']?[ \\t]{0,10}:[ \\t]{0,10}[|>][-+]?[ \\t]{0,10}\\r?\\n)(?:[ \\t][^\\r\\n]*(?:\\r\\n|\\n|\\r|$)){1,200}`, 'gi'),
  // key = value, key: value, "key": "value", KEY_NAME=value, "api key": "..." (JSON, YAML, env files, prose).
  // A quoted value may hold spaces, commas and escaped quotes; an unquoted one runs to the next separator.
  new RegExp(`(${KEY}[\\w-]{0,40}["']?\\s{0,10}[:=]\\s{0,10}(["']?))(?:(?:[^"\\\\\\r\\n]|\\\\.){8,1024}(?=")|(?:[^'\\\\\\r\\n]|\\\\.){8,1024}(?=')|[^\\s"',;}&]{8,1024})`, 'gi')
];

// Longest text any pattern above can claim from one secret (the JWT pattern: 3 + 512 + 4 + 8192 +
// 1 + 1024), with margin. PEM blocks with no END run to the end of the text, so they need none.
export const MAX_SECRET_SPAN = 16_384;

// Redact, then cut to `max` characters, without letting a secret that the cut would split leak
// its first part. The text is redacted up to max + slack; the output is limited to the length the
// first `max` input characters redact to, so nothing from the last `slack` input characters
// (where a split secret would sit) can reach the output however much earlier replacements shrink it.
export function redactAndCut(input, max, secrets = []) {
  const text = String(input);
  if (text.length <= max) return { text: redact(text, secrets), cut: false };
  const full = redact(text.slice(0, max + MAX_SECRET_SPAN), secrets);
  const safe = redact(text.slice(0, max), secrets).length;
  return { text: full.slice(0, Math.min(max, safe)), cut: true };
}

export function redact(input, secrets = []) {
  let out = String(input);
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8) out = out.split(secret).join('[REDACTED]');
  }
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, (match, keep) => (typeof keep === 'string' && match.startsWith(keep) ? `${keep}[REDACTED]` : '[REDACTED]'));
  }
  return out;
}
