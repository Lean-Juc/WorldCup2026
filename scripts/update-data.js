/**
 * update-data.js — Wikipedia scraper, no API key needed.
 *
 * Fetches the 2026 FIFA World Cup group stage results from Wikipedia,
 * parses scores and goal scorers, and writes data.json.
 *
 * Runtime: Node 18+ (built-in fetch). No dependencies.
 */

const fs = require('node:fs');

// ── Canonical team name mapping (Wikipedia → index.html names) ───────────────
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
  'portugal': 'Portugal', 'dr congo': 'Congo RD', 'democratic republic of the congo': 'Congo RD',
  'england': 'Angleterre', 'croatia': 'Croatie',
  'ghana': 'Ghana', 'panama': 'Panama',
  'uzbekistan': 'Ouzbékistan', 'colombia': 'Colombie'
};
const canon = n => NAME[(n || '').trim().toLowerCase()] || (n || '').trim();

const WIKI_URL = 'https://en.wikipedia.org/w/api.php?action=query&titles=2026_FIFA_World_Cup_group_stage&prop=revisions&rvprop=content&format=json&formatversion=2';

async function fetchWikitext() {
  const res = await fetch(WIKI_URL, {
    headers: { 'User-Agent': 'WC2026-tracker/1.0 (github.com/Lean-Juc/WorldCup2026)' }
  });
  if (!res.ok) throw new Error(`Wikipedia fetch failed: ${res.status}`);
  const json = await res.json();
  return json.query.pages[0].revisions[0].content;
}

// ── Parse {{Football box}} templates ─────────────────────────────────────────
function parseMatches(wikitext) {
  const results = {};
  const events = {};

  // Match all {{football box ...}} blocks
  const boxRegex = /\{\{[Ff]ootball box([^}]|\}(?!\}))*\}\}/g;
  let m;

  while ((m = boxRegex.exec(wikitext)) !== null) {
    const block = m[0];
    const get = (key) => {
      const r = new RegExp(`\\|\\s*${key}\\s*=\\s*([^|\\n}]+)`, 'i');
      const match = block.match(r);
      return match ? match[1].trim() : null;
    };

    const home = canon(get('home'));
    const away = canon(get('away'));
    const score1 = get('score1') || get('goals1');
    const score2 = get('score2') || get('goals2');
    const report = get('report') || '';

    // Only process if we have a final score (not a placeholder like "– – –")
    if (!home || !away) continue;
    const gh = parseInt(score1);
    const ga = parseInt(score2);
    if (isNaN(gh) || isNaN(ga)) continue;
    if (score1 && score1.includes('–') && !score1.match(/^\d/)) continue;

    const key = `${home}_${away}`;
    results[key] = [gh, ga];

    // Parse goal scorers
    const goalEvents = [];

    const parseGoalLine = (raw, teamName) => {
      if (!raw) return;
      // Each scorer separated by \n or {{br}}
      const entries = raw.split(/\{\{br\}\}|\n/i).map(s => s.trim()).filter(Boolean);
      for (const entry of entries) {
        // e.g. "[[Kai Havertz|Havertz]] {{goal|6}}" or "Havertz {{pen|45+5}}"
        const isPen = /\{\{pen/i.test(entry);
        const isOG = /\{\{og/i.test(entry);
        const minuteMatch = entry.match(/\{\{(?:goal|pen|og)[^}]*\|(\d+)(?:\+(\d+))?/i);
        if (!minuteMatch) continue;
        const min = parseInt(minuteMatch[1]);
        const extra = minuteMatch[2] ? parseInt(minuteMatch[2]) : undefined;

        // Extract player name (strip wiki links and templates)
        let player = entry
          .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
          .replace(/\{\{[^}]+\}\}/g, '')
          .replace(/'{2,}/g, '')
          .trim()
          .split(/\s+/).slice(0, 3).join(' ');

        const ev = { t: 'goal', m: min, team: teamName, p: player };
        if (extra) ev.x = extra;
        if (isPen) ev.d = 'Penalty';
        if (isOG) ev.d = 'Own Goal';
        goalEvents.push(ev);
      }
    };

    // Try to get goal1/goal2 fields
    parseGoalLine(get('goals1') || get('goal1') || get('report1'), home);
    parseGoalLine(get('goals2') || get('goal2') || get('report2'), away);

    if (goalEvents.length > 0) {
      goalEvents.sort((a, b) => a.m - b.m || (a.x || 0) - (b.x || 0));
      events[key] = goalEvents;
    }
  }

  return { results, events };
}

// ── Fallback: parse from the simpler {{Fb r}} table rows ─────────────────────
function parseFromResultTables(wikitext) {
  const results = {};

  // Match patterns like: | {{fb|GER}} || 7 – 1 || {{fb|CUW}}
  // or simpler: GER 7–1 CUW style
  const rowRegex = /\|\s*\{\{fb\|([A-Z]{2,3})\}\}\s*\|\|\s*(\d+)\s*[–\-]\s*(\d+)\s*\|\|\s*\{\{fb\|([A-Z]{2,3})\}\}/g;

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

  let m;
  while ((m = rowRegex.exec(wikitext)) !== null) {
    const home = FIFA_CODE[m[1]];
    const away = FIFA_CODE[m[4]];
    const gh = parseInt(m[2]);
    const ga = parseInt(m[3]);
    if (home && away && !isNaN(gh) && !isNaN(ga)) {
      results[`${home}_${away}`] = [gh, ga];
    }
  }

  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Load existing data to preserve manually-set events
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync('data.json', 'utf8')); } catch {}
  const prevEvents = prev.events || {};

  console.log('Fetching Wikipedia wikitext...');
  const wikitext = await fetchWikitext();

  console.log('Parsing match results...');
  let { results, events } = parseMatches(wikitext);

  // Fallback: try the simpler table format if we got nothing
  if (Object.keys(results).length === 0) {
    console.log('Primary parser got 0 results, trying fallback...');
    results = parseFromResultTables(wikitext);
  }

  console.log(`Found ${Object.keys(results).length} finished matches.`);

  // Merge events: keep previously-set events (manual or parsed), add new ones
  const mergedEvents = { ...prevEvents };
  for (const [key, evs] of Object.entries(events)) {
    if (evs.length > 0 && !mergedEvents[key]) {
      mergedEvents[key] = evs;
    }
  }

  // If Wikipedia gave us fewer results than we already had, keep the existing ones
  const finalResults = Object.keys(results).length >= Object.keys(prev.results || {}).length
    ? results
    : prev.results || {};

  const out = {
    updated: new Date().toISOString(),
    source: 'wikipedia',
    count: Object.keys(finalResults).length,
    results: finalResults,
    events: mergedEvents
  };

  fs.writeFileSync('data.json', JSON.stringify(out, null, 2) + '\n');
  console.log(`✅ data.json written — ${out.count} matches, ${Object.keys(mergedEvents).length} with events.`);
}

main().catch(e => { console.error(e); process.exit(1); });
