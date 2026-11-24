// SAMPLE data for trying the app before real data exists. Every record carries sample: true and
// is labelled SAMPLE in the UI. Sources point at example.com on purpose: they are not real research.
const now = () => new Date().toISOString();
const ev = n => [{ url: `https://example.com/sample-source-${n}`, date: '', quote: 'SAMPLE source: not real research.' }];

export function sampleData() {
  const t = now();
  const findings = [
    { id: 'sample-trend-1', kind: 'trend', sample: true, status: 'new', created: t, title: 'SAMPLE: "Day in my side hustle" vlogs', platforms: ['tiktok', 'instagram'], format: 'Vertical vlog, 30–60 s', why: 'Example of how a trend card looks: why it matters, sources, momentum and fit.', evidence: ev(1), momentum: 'unknown', momentumBasis: '', fit: 'medium', fitReason: 'Example fit reasoning.', monetization: 'Example path: affiliate links to tools shown in the video.', ideas: ['SAMPLE: My first week selling templates'] },
    { id: 'sample-niche-1', kind: 'niche', sample: true, status: 'new', created: t, title: 'SAMPLE: Budget meal prep', demand: 'Example demand note.', monetization: 'Example: digital recipe packs, grocery affiliate programs.', competition: 'Example competition note.', evidence: ev(2) },
    { id: 'sample-question-1', kind: 'question', sample: true, status: 'new', created: t, title: 'SAMPLE: "How do small creators get paid?"', evidence: ev(3) },
  ];
  const items = [
    { id: 'sample-item-1', sample: true, created: t, updated: t, title: 'SAMPLE: 3 tools that saved me 5 hours', goal: 'Sales or leads', platform: 'tiktok', format: 'Tutorial', priority: 'high', stage: 'drafting', trendIds: ['sample-trend-1'], brief: { audience: 'New freelancers', angle: 'Show, do not tell', cta: 'Link in bio for the free checklist' }, hook: 'I stopped doing this by hand…', draft: '1. Hook\n2. Tool one on screen\n3. Tool two\n4. Tool three\n5. CTA', caption: 'SAMPLE caption #productivity', hashtags: '#productivity #sidehustle', scheduledFor: '' },
  ];
  const posts = [
    { id: 'tiktok:sample:1', sample: true, platform: 'tiktok', identity: null, linkable: false, title: 'SAMPLE post A', url: '', date: '', metrics: m(12000, 900, 40, 30, 80, 25, 6), currency: null, importedAt: t, source: 'sample' },
    { id: 'tiktok:sample:2', sample: true, platform: 'tiktok', identity: null, linkable: false, title: 'SAMPLE post B', url: '', date: '', metrics: m(800, 30, 2, 1, 3, 1, 0), currency: null, importedAt: t, source: 'sample' },
    { id: 'tiktok:sample:3', sample: true, platform: 'tiktok', identity: null, linkable: false, title: 'SAMPLE post C', url: '', date: '', metrics: m(2400, 120, 9, 4, 12, 4, 1), currency: null, importedAt: t, source: 'sample' },
    { id: 'youtube:sample:4', sample: true, platform: 'youtube', identity: null, linkable: false, title: 'SAMPLE Short D', url: '', date: '', metrics: m(5100, 210, 15, 6, null, 12, 3), currency: null, importedAt: t, source: 'sample' },
  ];
  return { findings, items, posts };
}

function m(views, likes, comments, shares, saves, follows, clicks) {
  return { views, impressions: null, reach: null, likes, comments, shares, saves, follows, watchHours: null, avgViewSeconds: null, profileVisits: null, clicks, revenue: null };
}
