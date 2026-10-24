import { getJson } from '../util.mjs';

/** Bluesky 공개 검색 (api.bsky.app - 인증 불필요) */
export async function searchBluesky(q, { limit = 25, sort = 'latest' } = {}) {
  const url = `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(
    q
  )}&limit=${limit}&sort=${sort}`;
  const j = await getJson(url, { minGapMs: 2000 });
  return (j.posts || []).map((p) => ({
    platform: 'bluesky',
    source: `bsky:${q}`,
    title: (p.record?.text || '').replace(/\s+/g, ' ').slice(0, 220),
    link: p.uri
      ? `https://bsky.app/profile/${p.author?.did}/post/${String(p.uri).split('/').pop()}`
      : '',
    ts: p.indexedAt || p.record?.createdAt,
    author: `@${p.author?.handle || ''}`,
    likes: p.likeCount || 0,
    reposts: p.repostCount || 0,
  }));
}

export async function collectBluesky(cfg) {
  const out = [];
  const errors = [];
  for (const q of cfg.bluesky?.queries || []) {
    try {
      out.push(...(await searchBluesky(q)));
    } catch (e) {
      errors.push(`bsky "${q}": ${e.message}`);
    }
  }
  return { items: out, errors };
}
