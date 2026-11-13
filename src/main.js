import { Actor, log } from 'apify';
import { CheerioCrawler } from 'crawlee';

await Actor.init();
const input = (await Actor.getInput()) || {};
const startUrl = String(input.startUrl || '').trim();
const maxPages = Math.min(500, Math.max(1, parseInt(input.maxPages, 10) || 50));
let start;
try { start = new URL(startUrl); if (!/^https?:$/.test(start.protocol)) throw new Error('x'); }
catch { await Actor.fail('Start address is missing or not a valid http(s) address. Example: https://www.example.com'); }

const UA = 'Mozilla/5.0 (compatible; BrokenLinkChecker/1.0; +https://apify.com/20vision/broken-link-checker)';
const host = (u) => new URL(u).hostname.replace(/^www\./, '');
const siteHost = host(start.href);
const refs = new Map();      // target -> [{page, kind, linkText}]
const pageStatus = new Map(); // crawled page url -> status
let handled = 0;

const crawler = new CheerioCrawler({
  maxRequestsPerCrawl: maxPages,
  maxConcurrency: 8,
  additionalHttpErrorStatusCodes: [],
  ignoreHttpErrorStatusCodes: [400, 401, 402, 403, 404, 405, 410, 429, 500, 502, 503],
  requestHandler: async ({ request, $, response, enqueueLinks }) => {
    if (handled >= maxPages) return;
    handled++;
    const page = request.loadedUrl || request.url;
    pageStatus.set(request.url, response.statusCode);
    if (response.statusCode >= 400) return;
    const ctype = String(response.headers['content-type'] || '');
    if (!ctype.includes('html')) return;
    const add = (raw, kind, text) => {
      if (!raw) return;
      raw = raw.trim();
      if (/^(mailto:|tel:|javascript:|data:|sms:|#)/i.test(raw)) return;
      let u; try { u = new URL(raw, page); } catch { return; }
      if (!/^https?:$/.test(u.protocol)) return;
      if (u.pathname.startsWith('/cdn-cgi/l/email-protection')) return; // Cloudflare email obfuscation, decoded by script in the browser
      u.hash = '';
      const key = u.href;
      if (!refs.has(key)) refs.set(key, []);
      refs.get(key).push({ page, kind, linkText: (text || '').replace(/\s+/g, ' ').trim().slice(0, 120) });
    };
    $('a[href]').each((_, el) => add($(el).attr('href'), 'link', $(el).text() || $(el).attr('aria-label') || $(el).find('img').attr('alt')));
    $('img[src]').each((_, el) => add($(el).attr('src'), 'image', $(el).attr('alt')));
    await enqueueLinks({ strategy: 'same-hostname', transformRequestFunction: (r) => { try { r.url = r.url.split('#')[0]; } catch {} return r; } });
  },
  failedRequestHandler: async ({ request }, error) => { pageStatus.set(request.url, { error: String(error.message || error).slice(0, 200) }); },
});
await crawler.run([start.href]);
log.info(`Crawled ${pageStatus.size} pages; ${refs.size} unique link and image addresses to check`);

async function check(url) {
  const opts = (method) => ({ method, redirect: 'follow', headers: { 'user-agent': UA, accept: '*/*' }, signal: AbortSignal.timeout(20000) });
  try {
    let r = await fetch(url, opts('HEAD'));
    if (r.status === 405) { r.body?.cancel?.(); r = await fetch(url, opts('GET')); }
    r.body?.cancel?.();
    return { status: r.status };
  } catch (e) {
    return { error: String(e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code || e.cause?.message || e.message)).slice(0, 120) };
  }
}

const results = new Map();
const targets = [...refs.keys()];
let idx = 0;
await Promise.all(Array.from({ length: 15 }, async () => {
  while (idx < targets.length) {
    const t = targets[idx++];
    // pages we crawled already have a status
    const known = pageStatus.get(t);
    results.set(t, typeof known === 'number' ? { status: known } : known && known.error ? { error: known.error } : await check(t));
  }
}));

let broken = 0;
const rows = [];
for (const [t, list] of refs) {
  const r = results.get(t);
  if (!r || (r.status && r.status < 400)) continue;
  for (const ref of list) { broken++; rows.push({ page: ref.page, link: t, kind: ref.kind, status: r.status ?? null, error: r.error ?? null, linkText: ref.linkText }); }
}
if (rows.length) await Actor.pushData(rows);
log.info(`SUMMARY: ${broken} broken links or images found (${rows.length ? new Set(rows.map(r => r.link)).size : 0} unique addresses) on ${pageStatus.size} pages checked; ${refs.size} addresses tested.`);
await Actor.setValue('SUMMARY', { startUrl: start.href, pagesCrawled: pageStatus.size, addressesChecked: refs.size, brokenFound: broken });
await Actor.exit();
