/**
 * update-data.js — Wikipedia scraper, no API key needed.
 *
 * Fetches 2026 FIFA World Cup results from Wikipedia (multiple pages),
 * parses scores, and writes data.json.
 *
 * Runtime: Node 18+ (built-in fetch). No dependencies.
 */

const fs = require('node:fs');

// ── Canonical team name mapping ───────────────────────────────────────────────
const NAME = {
  'mexico': 'Mexique', 'south africa': 'Afrique du Sud',
  'south korea': 'Corée du Sud', 'korea republic': 'Corée du Sud',
  'czechia': 'Tchéquie', 'czech republic': 'Tchéquie',
  'canada': 'Canada', 'bosnia and herzegovina': 'Bosnie-Herzégovine',
  'united states': 'États-Unis', 'usa': 'États-Unis',
  'paraguay': 'Paraguay', 'qatar': 'Qatar', 'switzerland': 'Suisse',
  'brazil': 'Brésil', 'morocco': 'Maroc', 'haiti': 'Haïti',
  'scotland': 'Écosse', 'australia': 'Australie',
  'turkey': 'Turquie', 'türkiye': 'Turquie',
  'germany': 'Allemagne', 'curaçao': 'Curaçao', 'curacao': 'Curaçao',
  'netherlands': 'Pays-Bas', 'japan': 'Japon',
  "ivory coast": "Côte d'Ivoire", "côte d'ivoire": "Côte d'Ivoire",
  'ecuador': 'Équateur', 'tunisia': 'Tunisie', 'sweden': 'Suède',
  'spain': 'Espagne', 'cape verde': 'Cap-Vert',
  'belgium': 'Belgique', 'egypt': 'Égypte',
  'saudi arabia': 'Arabie Saoudite', 'uruguay': 'Uruguay',
  'iran': 'Iran', 'new zealand': 'Nouvelle-Zélande',
  'france': 'France', 'senegal': 'Sénégal', 'iraq': 'Irak',
  'norway': 'Norvège', 'argentina': 'Argentine', 'algeria': 'Algérie',
  'austria': 'Autriche', 'jordan': 'Jordanie',
  'portugal': 'Portugal', 'dr congo': 'Congo RD',
  'democratic republic of the congo': 'Congo RD',
  'england': 'Angleterre', 'croatia': 'Croatie',
  'ghana': 'Ghana', 'panama': 'Panama',
  'uzbekistan': 'Ouzbékistan', 'colombia': 'Colombie'
};
const canon = n => NAME[(n || '').trim().toLowerCase()] || (n || '').trim();

// FIFA 3-letter codes used in Wikipedia templates
const FIFA_CODE = {
  'MEX': 'Mexique', 'RSA': 'Afrique du Sud', 'KOR': 'Corée du Sud',
  'CZE': 'Tchéquie', 'CAN': 'Canada', 'BIH': 'Bosnie-Herzégovine',
  'USA': 'États-Unis', 'PAR': 'Paraguay', 'QAT': 'Qatar', 'SUI': 'Suisse',
  'BRA': 'Brésil', 'MAR': 'Maroc', 'HAI': 'Haïti', 'SCO': 'Écosse',
  'AUS': 'Australie', 'TUR': 'Turquie', 'GER': 'Allemagne', 'CUW': 'Curaçao',
  'NED': 'Pays-Bas', 'JPN': 'Japon', 'CIV': "Côte d'Ivoire", 'ECU': 'Équateur',
  'TUN': 'Tunisie', 'SWE': 'Suède', 'ESP': 'Espagne', 'CPV': 'Cap-Vert',
  'BEL': 'Belgique', 'EGY': 'Égypte', 'KSA': 'Arabie Saoudite', 'URU': 'Uruguay',
  'IRN': 'Iran', 'NZL': 'Nouvelle-Zélande', 'FRA': 'France', 'SEN': 'Sénégal',
  'IRQ': 'Irak', 'NOR': 'Norvège', 'ARG': 'Argentine', 'ALG': 'Algérie',
  'AUT': 'Autriche', 'JOR': 'Jordanie', 'POR': 'Portugal', 'COD': 'Congo RD',
  'ENG': 'Angleterre', 'CRO': 'Croatie', 'GHA': 'Ghana', 'PAN': 'Panama',
  'UZB': 'Ouzbékistan', 'COL': 'Colombie'
};

// ── Wikipedia API fetch ───────────────────────────────────────────────────────
async function fetchWikitext(title) {
  const url = `https://en.wikipedia.org/w/api.php?` + new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    format: 'json',
    formatversion: '2'
  });

  const res = await fetch(url, {
    headers: { 'User-Agent': 'WC2026-tracker/1.0 (github.com/Lean-Juc/WorldCup2026)' }
  });
  if (!res.ok) throw new Error(`Wikipedia fetch failed: ${res.status}`);

  const json = await res.json();
  console.log('Wikipedia response keys:', Object.keys(json));

  const pages = json?.query?.pages;
  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    // Try object format (older API)
    const pagesObj = json?.query?.pages;
    if (pagesObj && typeof pagesObj === 'object') {
      const page = Object.values(pagesObj)[0];
      return page?.revisions?.[0]?.['*'] || page?.revisions?.[0]?.slots?.main?.['*'] || null;
    }
    throw new Error('No pages in Wikipedia response: ' + JSON.stringify(json).slice(0, 300));
  }

  const page = pages[0];
  if (page.missing) throw new Error(`Wikipedia page not found: ${title}`);

  // formatversion=2 puts content in slots.main.content
  return page?.revisions?.[0]?.slots?.main?.content
    || page?.revisions?.[0]?.content
    || null;
}

// ── Parse {{Fs match}} / {{Football box}} style templates ─────────────────────
function parseWikitext(wikitext) {
  const results = {};
  const events = {};

  if (!wikitext) return { results, events };

  // Strategy 1: {{fs match}} templates (common in WC group stage pages)
  // | home = Germany | score = 7–1 | away = Curaçao
  const fsRegex = /\{\{[Ff]s match[^}]*?\| *home *= *([^|\n}]+)[^}]*?\| *score *= *(\d+)[–\-](\d+)[^}]*?\| *away *= *([^|\n}]+)/g;
  let m;
  while ((m = fsRegex.exec(wikitext)) !== null) {
    const home = canon(m[1].replace(/\[\[.*?\|?(.*?)\]\]/g, '$1').trim());
    const away = canon(m[4].replace(/\[\[.*?\|?(.*?)\]\]/g, '$1').trim());
    const gh = parseInt(m[2]), ga = parseInt(m[3]);
    if (home && away && !isNaN(gh) && !isNaN(ga)) {
      results[`${home}_${away}`] = [gh, ga];
    }
  }

  // Strategy 2: {{football box}} with home/away/score fields
  const boxBlocks = wikitext.match(/\{\{[Ff]ootball[\s_]box[\s\S]*?\n\}\}/g) || [];
  for (const block of boxBlocks) {
    const get = key => {
      const r = new RegExp(`\\|\\s*${key}\\s*=\\s*([^|\\n}]+)`, 'i');
      const match = block.match(r);
      return match ? match[1].trim() : null;
    };
    const home = canon(get('home'));
    const away = canon(get('away'));
    const s1 = get('score1') || get('goals1');
    const s2 = get('score2') || get('goals2');
    const gh = parseInt(s1), ga = parseInt(s2);
    if (home && away && !isNaN(gh) && !isNaN(ga)) {
      const key = `${home}_${away}`;
      results[key] = [gh, ga];

      // Parse scorers
      const evs = [];
      const parseScorers = (raw, team) => {
        if (!raw) return;
        const entries = raw.split(/\{\{br\}\}/i).map(s => s.trim()).filter(Boolean);
        for (const e of entries) {
          const isPen = /\{\{pen/i.test(e);
          const isOG = /\{\{og/i.test(e);
          const minM = e.match(/\{\{(?:goal|pen|og)[^}]*\|(\d+)(?:\+(\d+))?/i);
          if (!minM) continue;
          const ev = {
            t: 'goal',
            m: parseInt(minM[1]),
            team,
            p: e.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
               .replace(/\{\{[^}]+\}\}/g, '').replace(/'{2,}/g, '').trim().split(/\s+/).slice(0, 3).join(' ')
          };
          if (minM[2]) ev.x = parseInt(minM[2]);
          if (isPen) ev.d = 'Penalty';
          if (isOG) ev.d = 'Own Goal';
          evs.push(ev);
        }
      };
      parseScorers(get('goal1') || get('goals1'), home);
      parseScorers(get('goal2') || get('goals2'), away);
      if (evs.length) events[key] = evs.sort((a, b) => a.m - b.m || (a.x || 0) - (b.x || 0));
    }
  }

  // Strategy 3: {{fb|CODE}} score table rows
  // | {{fb|GER}} || 7–1 || {{fb|CUW}}
  const fbRegex = /\{\{fb\|([A-Z]{2,3})\}\}\s*\|\|\s*(\d+)\s*[–\-]\s*(\d+)\s*\|\|\s*\{\{fb\|([A-Z]{2,3})\}\}/g;
  while ((m = fbRegex.exec(wikitext)) !== null) {
    const home = FIFA_CODE[m[1]], away = FIFA_CODE[m[4]];
    const gh = parseInt(m[2]), ga = parseInt(m[3]);
    if (home && away && !isNaN(gh) && !isNaN(ga)) {
      results[`${home}_${away}`] = [gh, ga];
    }
  }

  // Strategy 4: plain score in match report lines
  // Germany 7–1 Curaçao  or  [[Germany]] 7 – 1 [[Curaçao]]
  const plainRegex = /\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]\s+(\d+)\s*[–\-]\s*(\d+)\s+\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g;
  while ((m = plainRegex.exec(wikitext)) !== null) {
    const home = canon(m[1]), away = canon(m[4]);
    const gh = parseInt(m[2]), ga = parseInt(m[3]);
    if (home && away && home !== away && !isNaN(gh) && !isNaN(ga) && gh < 20 && ga < 20) {
      if (!results[`${home}_${away}`] && !results[`${away}_${home}`]) {
        results[`${home}_${away}`] = [gh, ga];
      }
    }
  }

  return { results, events };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync('data.json', 'utf8')); } catch {}
  const prevResults = prev.results || {};
  const prevEvents = prev.events || {};

  // Fetch multiple Wikipedia pages for better coverage
  const pages = [
    '2026_FIFA_World_Cup_group_stage',
    '2026_FIFA_World_Cup'
  ];

  let allResults = {};
  let allEvents = {};

  for (const title of pages) {
    try {
      console.log(`Fetching: ${title}`);
      const wikitext = await fetchWikitext(title);
      if (!wikitext) { console.log(`  → empty`); continue; }
      console.log(`  → ${wikitext.length} chars`);
      const { results, events } = parseWikitext(wikitext);
      console.log(`  → ${Object.keys(results).length} results, ${Object.keys(events).length} with events`);
      Object.assign(allResults, results);
      for (const [k, v] of Object.entries(events)) {
        if (!allEvents[k]) allEvents[k] = v;
      }
    } catch (e) {
      console.warn(`  → failed: ${e.message}`);
    }
  }

  // Merge with previous: never go backwards (keep prev if we got fewer)
  const finalResults = Object.keys(allResults).length >= Object.keys(prevResults).length
    ? allResults : prevResults;

  // Merge events: prefer new parsed, keep existing manual ones
  const finalEvents = { ...prevEvents };
  for (const [k, v] of Object.entries(allEvents)) {
    if (v.length > 0) finalEvents[k] = v;
  }

  const out = {
    updated: new Date().toISOString(),
    source: 'wikipedia',
    count: Object.keys(finalResults).length,
    results: finalResults,
    events: finalEvents
  };

  fs.writeFileSync('data.json', JSON.stringify(out, null, 2) + '\n');
  console.log(`✅ Done — ${out.count} matches, ${Object.keys(finalEvents).length} with events.`);
  if (out.count === 0) {
    console.error('WARNING: 0 results written — check parser');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
