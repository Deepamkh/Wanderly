// Wikipedia, Wikivoyage and Wikidata helpers (free, CC BY-SA content – attribute on the UI).
import { fetchJson, createLimiter } from '../utils/http.js';

const DAY = 24 * 3_600_000;
const wp = (lang = 'en') => `https://${lang}.wikipedia.org`;
const WV = 'https://en.wikivoyage.org';
const COMMONS = 'https://commons.wikimedia.org';
const commonsLimit = createLimiter(4);

/**
 * Wikipedia articles near a point that have a photo – one call (plus a few continuations).
 * Returns [{ title, lat, lon, thumb }]. Used to find photos for attractions with no wiki link.
 */
export async function nearbyArticles(lat, lon, radius) {
  const r = Math.round(Math.min(10000, Math.max(100, radius))); // geosearch maximum is 10 km
  const base =
    `${wp()}/w/api.php?action=query&format=json&generator=geosearch&ggscoord=${lat}|${lon}&ggsradius=${r}` +
    `&ggslimit=250&prop=pageimages|coordinates&piprop=thumbnail&pithumbsize=500&pilimit=max&colimit=max`;
  const pages = new Map();
  let cont = '';
  for (let round = 0; round < 6; round++) {
    const d = await fetchJson(base + cont, { ttl: DAY, timeout: 12_000 });
    for (const p of Object.values(d.query?.pages || {})) {
      const prev = pages.get(p.pageid) || { title: p.title };
      if (p.thumbnail) prev.thumb = p.thumbnail.source;
      if (p.coordinates?.[0]) Object.assign(prev, { lat: p.coordinates[0].lat, lon: p.coordinates[0].lon });
      pages.set(p.pageid, prev);
    }
    if (!d.continue) break;
    cont = Object.entries(d.continue).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  }
  return [...pages.values()].filter((p) => p.thumb && p.lat != null);
}

/** A photo taken right at a spot, from Wikimedia Commons (geotagged files within ~120 m). */
export async function commonsPhotoNear(lat, lon) {
  const url =
    `${COMMONS}/w/api.php?action=query&format=json&generator=geosearch&ggsnamespace=6&ggscoord=${lat}|${lon}` +
    `&ggsradius=120&ggslimit=8&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=500`;
  const d = await commonsLimit(() => fetchJson(url, { ttl: 7 * DAY, timeout: 8000 }));
  const files = Object.values(d.query?.pages || {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0)) // nearest first
    .filter((p) => !JUNK_IMG.test(p.title) && !/\.(svg|gif|tiff?|pdf|webm|ogv)$/i.test(p.title));
  for (const p of files) {
    const ii = p.imageinfo?.[0];
    if (ii && ii.width >= 400 && /^image\/(jpeg|png|webp)$/.test(ii.mime)) return ii.thumburl || ii.url;
  }
  return null;
}

export function parseWikiTag(tag) {
  if (!tag) return null;
  const m = String(tag).match(/^([a-z-]{2,12}):(.+)$/);
  return m ? { lang: m[1], title: m[2] } : { lang: 'en', title: String(tag) };
}

export async function enTitleFromWikidata(qid) {
  if (!qid) return null;
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks&sitefilter=enwiki&format=json&ids=${encodeURIComponent(qid)}`;
  const data = await fetchJson(url, { ttl: 7 * DAY });
  return data.entities?.[qid]?.sitelinks?.enwiki?.title || null;
}

export async function searchTitle(q) {
  const url = `${wp()}/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=${encodeURIComponent(q)}`;
  const data = await fetchJson(url, { ttl: DAY });
  return data.query?.search?.[0]?.title || null;
}

/** Best-effort English Wikipedia title for a place. */
export async function resolveTitle({ wikipedia, wikidata, name, city }) {
  const tag = parseWikiTag(wikipedia);
  if (tag?.lang === 'en') return tag.title;
  const fromWd = await enTitleFromWikidata(wikidata).catch(() => null);
  if (fromWd) return fromWd;
  if (!name) return null;
  return searchTitle(city ? `${name} ${city}` : name).catch(() => null);
}

export async function summary(title) {
  const url = `${wp()}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const d = await fetchJson(url, { ttl: DAY });
  return {
    title: d.title,
    description: d.description || null,
    extract: d.extract || null,
    thumbnail: d.thumbnail?.source || null,
    image: d.originalimage?.source || null,
    url: d.content_urls?.desktop?.page || `${wp()}/wiki/${encodeURIComponent(title)}`,
  };
}

const JUNK_IMG = /(flag|logo|icon|map|locator|coat[_ ]of[_ ]arms|seal|symbol|signature|diagram|chart|emblem|blank|location)/i;

// Wikimedia only serves thumbnails at standard widths (and never larger than the original),
// so we ask the API for the proper URL instead of editing the size inside a link.
const HEADER_WIDTH = 1280; // a standard Wikimedia thumbnail step
const MIN_WIDTH = 800; // smaller photos look blurry in a full-width header
const fileKey = (t) => t.replace(/^(File|Image):/i, '').replace(/_/g, ' ').trim().toLowerCase();

export async function images(title, max = 8) {
  const url = `${wp()}/api/rest_v1/page/media-list/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const d = await fetchJson(url, { ttl: DAY });

  const files = (d.items || [])
    .filter((it) => it.type === 'image' && it.title && !/\.(svg|gif|tiff?)$/i.test(it.title) && !JUNK_IMG.test(it.title))
    .sort((a, b) => (b.leadImage ? 1 : 0) - (a.leadImage ? 1 : 0)) // lead photo first
    .slice(0, max + 8); // a few spares in case some are too small
  if (!files.length) return [];

  const titles = files.map((f) => (/^(File|Image):/i.test(f.title) ? f.title : `File:${f.title}`));
  const info = await fetchJson(
    `${wp()}/w/api.php?action=query&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=${HEADER_WIDTH}` +
      `&format=json&titles=${encodeURIComponent(titles.join('|'))}`,
    { ttl: DAY },
  );
  const byFile = new Map();
  for (const page of Object.values(info.query?.pages || {})) {
    const ii = page.imageinfo?.[0];
    if (ii) byFile.set(fileKey(page.title), ii);
  }

  const out = [];
  for (const f of files) {
    const ii = byFile.get(fileKey(f.title));
    if (!ii || ii.width < MIN_WIDTH || !/^image\/(jpeg|png|webp)$/.test(ii.mime)) continue;
    out.push({
      src: ii.thumburl || ii.url, // thumburl is the original when it's narrower than HEADER_WIDTH
      width: Math.min(ii.width, HEADER_WIDTH),
      caption: f.caption?.text || null,
      source: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(f.title)}`,
    });
    if (out.length >= max) break;
  }
  return out;
}

// Wikimedia serves thumbnails only at these standard widths; any other width fails to load.
const THUMB_STEPS = [120, 250, 330, 500, 960, 1280];
export const standardWidth = (w) => THUMB_STEPS.find((s) => s >= w) ?? THUMB_STEPS[THUMB_STEPS.length - 1];

/** English Wikipedia titles for many Wikidata IDs at once (50 per request). Returns { [qid]: title }. */
export async function enTitlesFromWikidata(qids) {
  const unique = [...new Set(qids.filter((q) => /^Q\d+$/.test(q || '')))];
  const result = {};
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks&sitefilter=enwiki&format=json&ids=${chunk.join('|')}`;
    const d = await fetchJson(url, { ttl: 7 * DAY });
    for (const [id, e] of Object.entries(d.entities || {})) if (e.sitelinks?.enwiki?.title) result[id] = e.sitelinks.enwiki.title;
  }
  return result;
}

/** Batch thumbnail lookup (up to 50 titles per request). Returns { [inputTitle]: url }. */
export async function thumbnails(titles, size = 500) {
  const unique = [...new Set(titles.filter(Boolean))];
  const result = {};
  const width = standardWidth(size);
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const url =
      `${wp()}/w/api.php?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=${width}` +
      `&redirects=1&format=json&titles=${encodeURIComponent(chunk.join('|'))}`;
    const d = await fetchJson(url, { ttl: DAY });
    const q = d.query || {};
    const alias = {};
    for (const n of q.normalized || []) alias[n.from] = n.to;
    for (const r of q.redirects || []) alias[r.from] = r.to;
    const byTitle = {};
    for (const p of Object.values(q.pages || {})) if (p.thumbnail) byTitle[p.title] = p.thumbnail.source;
    for (const t of chunk) {
      let k = t;
      for (let hop = 0; hop < 3 && alias[k]; hop++) k = alias[k];
      if (byTitle[k]) result[t] = byTitle[k];
    }
  }
  return result;
}

// ---------- section parsing (plain-text extracts with == Heading == markers) ----------

function splitSections(text) {
  const sections = [{ title: '_intro', level: 1, body: [] }];
  for (const line of text.split('\n')) {
    const m = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
    if (m) sections.push({ title: m[2], level: m[1].length, body: [] });
    else sections[sections.length - 1].body.push(line);
  }
  return sections.map((s) => ({ ...s, text: s.body.join('\n').trim() }));
}

function collect(sections, predicate) {
  const out = [];
  for (let i = 0; i < sections.length; i++) {
    if (!predicate(sections[i])) continue;
    const lvl = sections[i].level;
    const parts = [sections[i].text];
    for (let j = i + 1; j < sections.length && sections[j].level > lvl; j++) if (sections[j].text) parts.push(sections[j].text);
    out.push({ title: sections[i].title, text: parts.filter(Boolean).join('\n\n') });
  }
  return out;
}

async function plainExtract(base, title) {
  const url =
    `${base}/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=wiki` +
    `&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
  const d = await fetchJson(url, { ttl: DAY });
  const page = Object.values(d.query?.pages || {})[0];
  return page && !('missing' in page) ? page.extract || '' : '';
}

const paragraphs = (text, maxChars) => {
  const out = [];
  let total = 0;
  for (const p of text.split(/\n{1,}/).map((s) => s.trim()).filter((s) => s.length > 40)) {
    out.push(p);
    total += p.length;
    if (total > maxChars) break;
  }
  return out;
};

export async function history(title) {
  const text = await plainExtract(wp(), title);
  if (!text) return { paragraphs: [] };
  const secs = splitSections(text);
  const hist = collect(secs, (s) => s.level === 2 && /history|background|origins/i.test(s.title))[0];
  if (hist?.text) return { heading: hist.title, paragraphs: paragraphs(hist.text, 3500) };
  return { heading: 'Overview', paragraphs: paragraphs(secs[0].text, 2000) };
}

const TIP_SECTIONS = [
  { match: /^understand$/i, label: 'Good to know', icon: 'info' },
  { match: /^get around$/i, label: 'Getting around', icon: 'bus' },
  { match: /^stay safe$/i, label: 'Stay safe', icon: 'shield' },
  { match: /^stay healthy$/i, label: 'Stay healthy', icon: 'heart' },
  { match: /^respect$/i, label: 'Local etiquette', icon: 'hand' },
  { match: /^(cope|connect)$/i, label: 'Practical tips', icon: 'wrench' },
  { match: /^(talk|language)$/i, label: 'Language', icon: 'chat' },
  { match: /^(buy|money)$/i, label: 'Money & shopping', icon: 'wallet' },
];

function trimToSentences(text, max = 700) {
  const clean = text.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (end > 200 ? cut.slice(0, end + 1) : cut) + ' …';
}

/** Practical travel tips from Wikivoyage (CC BY-SA). */
export async function travelTips(title) {
  const text = await plainExtract(WV, title);
  if (!text) return { tips: [], url: null };
  const secs = splitSections(text);
  const tips = [];
  for (const def of TIP_SECTIONS) {
    const s = collect(secs, (x) => x.level === 2 && def.match.test(x.title))[0];
    if (s?.text && s.text.length > 80) tips.push({ label: def.label, icon: def.icon, text: trimToSentences(s.text) });
  }
  return { tips, url: `${WV}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` };
}
