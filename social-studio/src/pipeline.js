// Content item lifecycle: one platform per item. Moves go one step forward (or back to fix
// something). Approval is bound to the exact content approved: editing it afterwards voids it.
export const STAGES = ['idea', 'drafting', 'ready', 'approved', 'posted', 'measured'];
export const STAGE_LABEL = { idea: 'Idea', drafting: 'Drafting', ready: 'Ready for review', approved: 'Approved', posted: 'Posted', measured: 'Measured' };

// Fingerprint of everything that gets published.
export const contentKey = i => JSON.stringify([i.hook || '', i.draft || '', i.caption || '', i.hashtags || '']);
export const isApproved = i => !!i.approvedKey && i.approvedKey === contentKey(i);

export function nextAction(item) {
  switch (item.stage) {
    case 'idea': return 'Write the brief and a draft';
    case 'drafting': return item.draft?.trim() ? 'Finish the draft and send it to review' : 'Write the draft (hook, script, caption)';
    case 'ready': return 'Review the draft, then approve it';
    case 'approved':
      if (!isApproved(item)) return 'Content changed after approval: review and approve again';
      return item.scheduledFor ? `Post it by hand on ${item.scheduledFor}, then paste the post link` : 'Pick a date, post it by hand, then paste the post link';
    case 'posted': return 'Import this platform\'s analytics CSV to measure it';
    case 'measured': return 'Read the result in Results and plan the next one';
    default: return 'Unknown stage';
  }
}

// Returns { ok, item, error }. Pure: never mutates the input.
export function move(item, to, patch = {}) {
  const from = STAGES.indexOf(item.stage), target = STAGES.indexOf(to);
  if (target < 0) return { ok: false, error: `Unknown stage "${to}".` };
  if (target > from + 1) return { ok: false, error: `Move one step at a time: ${STAGE_LABEL[item.stage]} comes before ${STAGE_LABEL[to]}.` };
  const next = { ...item, ...patch, stage: to, updated: new Date().toISOString() };
  if (to === 'ready' && target > from && !next.draft?.trim()) return { ok: false, error: 'Write a draft before sending it to review.' };
  if (to === 'approved' && target > from) { next.approvedAt = next.updated; next.approvedKey = contentKey(next); }
  if (to === 'posted' && target > from) {
    if (!isApproved(next)) return { ok: false, error: next.approvedKey ? 'The content changed after approval. Approve it again first.' : 'Approve the item before marking it posted.' };
    const name = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' }[next.platform] || 'platform';
    if (!postIdentity(next.platform, next.postUrl)) return { ok: false, error: `Paste the link to the live ${name} post (a ${name} post URL).` };
  }
  if (to === 'measured' && target > from && !next.measuredBy) return { ok: false, error: 'Import an analytics CSV that includes this post to measure it.' };
  if (target < STAGES.indexOf('approved')) { next.approvedAt = null; next.approvedKey = null; } // back to editing: needs approval again
  return { ok: true, item: next };
}

// Stable post identity from a URL, per platform, or null if the URL is not that platform's post.
export function postIdentity(platform, url) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  const path = u.pathname;
  if (platform === 'youtube') {
    if (host === 'youtu.be') return path.slice(1).split('/')[0] ? `yt:${path.slice(1).split('/')[0]}` : null;
    if (!/(^|\.)youtube\.com$/.test(host)) return null;
    const v = u.searchParams.get('v') || path.match(/^\/(?:shorts|live|embed)\/([\w-]+)/)?.[1];
    return v ? `yt:${v}` : null;
  }
  if (platform === 'tiktok') {
    if (!/(^|\.)tiktok\.com$/.test(host)) return null;
    const id = path.match(/\/(?:video|photo)\/(\d+)/)?.[1];
    return id ? `tt:${id}` : (host.startsWith('vm.') || host.startsWith('vt.')) && path.length > 1 ? `ttshort:${path.slice(1).replace(/\/$/, '')}` : null;
  }
  if (platform === 'instagram') {
    if (!/(^|\.)instagram\.com$/.test(host)) return null;
    const code = path.match(/\/(?:p|reel|reels|tv)\/([\w-]+)/)?.[1];
    return code ? `ig:${code}` : null;
  }
  return null;
}

// Links an imported measurement to a posted item with the same platform post identity.
export function matchPost(items, post) {
  if (!post.identity) return null;
  return items.find(i => i.platform === post.platform && i.postUrl && postIdentity(i.platform, i.postUrl) === post.identity) || null;
}
