/**
 * update-data.js  —  API-FOOTBALL (api-sports.io) edition
 *
 * Writes data.json (results + standings-feeding scores + goal/card events) for
 * index.html. Run by the GitHub Action on a schedule.
 *
 *   Requires env  APIFOOTBALL_KEY   (free key from dashboard.api-football.com)
 *   Runtime       Node 18+  (built-in fetch, no dependencies)
 *
 * Free tier = ~100 requests/day. Budget is respected by:
 *   • 1 call per run for ALL fixtures + scores  (/fixtures?league=1&season=2026)
 *   • events fetched ONCE per finished match, then cached in data.json forever
 * At a 20-min cron that's ~72 base calls/day + a handful of one-off event calls.
 */
const fs = require('node:fs');

const KEY = process.env.APIFOOTBALL_KEY;
if (!KEY) { console.error('Missing APIFOOTBALL_KEY env var'); process.exit(1); }

const HOST = 'https://v3.football.api-sports.io';
const HEADERS = { 'x-apisports-key': KEY };
const LEAGUE = 1;        // FIFA World Cup
const SEASON = 2026;

// API-Football spellings -> canonical names used in index.html
const NAME = {
  'usa': 'USA', 'united states': 'USA',
  'south korea': 'South Korea', 'korea republic': 'South Korea',
  'czech republic': 'Czechia', 'czechia': 'Czechia',
  'turkey': 'Türkiye', 'türkiye': 'Türkiye', 'turkiye': 'Türkiye',
  'ivory coast': 'Ivory Coast', "côte d'ivoire": 'Ivory Coast',
  'dr congo': 'Congo DR', 'congo dr': 'Congo DR',
  'bosnia and herzegovina': 'Bosnia &amp; Herzegovina', 'bosnia & herzegovina': 'Bosnia &amp; Herzegovina',
  'cape verde islands': 'Cape Verde', 'cape verde': 'Cape Verde',
  'curacao': 'Curaçao', 'curaçao': 'Curaçao'
};
const canon = n => NAME[(n || '').trim().toLowerCase()] || (n || '').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path) {
  const res = await fetch(HOST + path, { headers: HEADERS });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text().catch(()=> '')}`);
  const j = await res.json();
  if (j.errors && Object.keys(j.errors).length) console.warn('API note:', JSON.stringify(j.errors));
  return j.response || [];
}

function mapEvents(raw) {
  const out = [];
  for (const e of raw) {
    const type = e.type, detail = e.detail || '';
    let t = null, d;
    if (type === 'Goal') {
      if (detail === 'Missed Penalty') continue;
      t = 'goal';
      if (detail === 'Penalty') d = 'Penalty';
      else if (detail === 'Own Goal') d = 'Own Goal';
    } else if (type === 'Card') {
      if (detail === 'Red Card') t = 'red';
      else if (detail === 'Second Yellow card') { t = 'red'; d = '2nd yellow'; }
      else if (detail === 'Yellow Card') t = 'yellow';
      else continue;
    } else continue;
    const ev = { t, m: e.time?.elapsed ?? 0, team: canon(e.team?.name) };
    if (e.time?.extra) ev.x = e.time.extra;
    if (e.player?.name) ev.p = e.player.name;
    if (t === 'goal' && e.assist?.name) ev.a = e.assist.name;
    if (d) ev.d = d;
    out.push(ev);
  }
  return out;
}

async function main() {
  // keep previously-cached events so we never re-fetch a finished match
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync('data.json', 'utf8')); } catch {}
  const events = prev.events || {};

  const fixtures = await api(`/fixtures?league=${LEAGUE}&season=${SEASON}`);
  const results = {};
  const newlyFinished = [];

  for (const fx of fixtures) {
    const st = fx.fixture?.status?.short;             // FT, AET, PEN = finished
    if (!['FT', 'AET', 'PEN'].includes(st)) continue;
    const home = canon(fx.teams?.home?.name);
    const away = canon(fx.teams?.away?.name);
    const gh = fx.goals?.home, ga = fx.goals?.away;
    if (gh == null || ga == null) continue;
    const key = `${home}_${away}`;
    results[key] = [gh, ga];
    if (!events[key]) newlyFinished.push({ id: fx.fixture.id, key });
  }

  // fetch events only for matches we don't already have (one-off, cached)
  for (const m of newlyFinished) {
    try {
      const raw = await api(`/fixtures/events?fixture=${m.id}`);
      events[m.key] = mapEvents(raw);
      console.log(`events: ${m.key} (${events[m.key].length})`);
      await sleep(1500);                               // be gentle on 10/min limit
    } catch (e) { console.warn('events failed for', m.key, e.message); }
  }

  const out = {
    updated: new Date().toISOString(),
    source: 'api-football',
    count: Object.keys(results).length,
    results,
    events
  };
  fs.writeFileSync('data.json', JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote data.json — ${out.count} finished, ${Object.keys(events).length} with events.`);
}

main().catch(e => { console.error(e); process.exit(1); });
