/**
 * update-data.js — Multi-source scraper (BBC Sport + Wikipedia fallback)
 * No API key needed. Node 18+ (built-in fetch).
 *
 * Sources tried in order:
 *  1. BBC Sport JSON API (scores within ~5 min of final whistle)
 *  2. Wikipedia group stage page (fallback, lags ~1-6h)
 */

const fs = require('node:fs');

// ── Team name normalisation ───────────────────────────────────────────────────
const NORM = {
  // BBC → canonical French
  'mexico': 'Mexique', 'south africa': 'Afrique du Sud',
  'south korea': 'Corée du Sud', 'korea republic': 'Corée du Sud', 'republic of korea': 'Corée du Sud',
  'czechia': 'Tchéquie', 'czech republic': 'Tchéquie',
  'canada': 'Canada', 'bosnia and herzegovina': 'Bosnie-Herzégovine', 'bosnia & herzegovina': 'Bosnie-Herzégovine',
  'united states': 'États-Unis', 'usa': 'États-Unis', 'us': 'États-Unis',
  'paraguay': 'Paraguay', 'qatar': 'Qatar', 'switzerland': 'Suisse',
  'brazil': 'Brésil', 'morocco': 'Maroc', 'haiti': 'Haïti',
  'scotland': 'Écosse', 'australia': 'Australie',
  'turkey': 'Turquie', 'türkiye': 'Turquie',
  'germany': 'Allemagne', 'curaçao': 'Curaçao', 'curacao': 'Curaçao',
  'netherlands': 'Pays-Bas', 'holland': 'Pays-Bas', 'japan': 'Japon',
  "ivory coast": "Côte d'Ivoire", "côte d'ivoire": "Côte d'Ivoire", "cote d'ivoire": "Côte d'Ivoire",
  'ecuador': 'Équateur', 'tunisia': 'Tunisie', 'sweden': 'Suède',
  'spain': 'Espagne', 'cape verde': 'Cap-Vert',
  'belgium': 'Belgique', 'egypt': 'Égypte',
  'saudi arabia': 'Arabie Saoudite', 'uruguay': 'Uruguay',
  'iran': 'Iran', 'new zealand': 'Nouvelle-Zélande',
  'france': 'France', 'senegal': 'Sénégal', 'iraq': 'Irak',
  'norway': 'Norvège', 'argentina': 'Argentine', 'algeria': 'Algérie',
  'austria': 'Autriche', 'jordan': 'Jordanie',
  'portugal': 'Portugal', 'dr congo': 'Congo RD', 'democratic republic of congo': 'Congo RD',
  'england': 'Angleterre', 'croatia': 'Croatie',
  'ghana': 'Ghana', 'panama': 'Panama',
  'uzbekistan': 'Ouzbékistan', 'colombia': 'Colombie'
};
const FIFA_CODE = {
  MEX:'Mexique',RSA:'Afrique du Sud',KOR:'Corée du Sud',CZE:'Tchéquie',
  CAN:'Canada',BIH:'Bosnie-Herzégovine',USA:'États-Unis',PAR:'Paraguay',
  QAT:'Qatar',SUI:'Suisse',BRA:'Brésil',MAR:'Maroc',HAI:'Haïti',SCO:'Écosse',
  AUS:'Australie',TUR:'Turquie',GER:'Allemagne',CUW:'Curaçao',NED:'Pays-Bas',
  JPN:'Japon',CIV:"Côte d'Ivoire",ECU:'Équateur',TUN:'Tunisie',SWE:'Suède',
  ESP:'Espagne',CPV:'Cap-Vert',BEL:'Belgique',EGY:'Égypte',KSA:'Arabie Saoudite',
  URU:'Uruguay',IRN:'Iran',NZL:'Nouvelle-Zélande',FRA:'France',SEN:'Sénégal',
  IRQ:'Irak',NOR:'Norvège',ARG:'Argentine',ALG:'Algérie',AUT:'Autriche',
  JOR:'Jordanie',POR:'Portugal',COD:'Congo RD',ENG:'Angleterre',CRO:'Croatie',
  GHA:'Ghana',PAN:'Panama',UZB:'Ouzbékistan',COL:'Colombie'
};
const canon = n => NORM[(n||'').trim().toLowerCase()] || (n||'').trim();

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; WC2026-tracker/2.0; +https://github.com/Lean-Juc/WorldCup2026)',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'en-GB,en;q=0.9'
};

// ── SOURCE 1 : BBC Sport live scores JSON ─────────────────────────────────────
// BBC exposes a public JSON feed used by their scores page
async function fetchBBC() {
  const results = {};
  // BBC Sport World Cup scores endpoint
  const urls = [
    'https://push.api.bbci.co.uk/p?m={"v":1,"e":"sport","q":{"competitions":["fifaworldcup2026"],"fixtures":"all"},"c":["f"]}',
    'https://www.bbc.co.uk/sport/football/world-cup/scores-fixtures/2026',
  ];

  // Try the BBC scores page (HTML) and extract scores from JSON-LD or embedded data
  try {
    const res = await fetch('https://www.bbc.co.uk/sport/football/world-cup/scores-fixtures', {
      headers: HEADERS
    });
    if (!res.ok) throw new Error(`BBC ${res.status}`);
    const html = await res.text();

    // BBC embeds scores in window.__INITIAL_DATA__ or similar JSON blobs
    // Look for score patterns: "homeScore":{"score":7} etc.
    const scoreBlocks = html.match(/"homeTeam":\{[^}]+\}[^}]+?"awayTeam":\{[^}]+\}/g) || [];

    // Also try extracting from JSON-LD
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];

    // Parse embedded __REDUX_STATE__ or __INITIAL_DATA__
    const reduxMatch = html.match(/window\.__(?:REDUX_STATE|INITIAL_DATA)__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    if (reduxMatch) {
      try {
        const data = JSON.parse(reduxMatch[1]);
        extractFromBBCData(data, results);
      } catch {}
    }

    console.log(`BBC HTML: ${html.length} chars, ${scoreBlocks.length} score blocks found`);
  } catch (e) {
    console.warn(`BBC fetch failed: ${e.message}`);
  }

  return results;
}

function extractFromBBCData(obj, results, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 12) return;
  // Look for match objects with home/away scores
  if (obj.homeTeam && obj.awayTeam &&
      obj.homeTeam.name && obj.awayTeam.name &&
      obj.homeScore !== undefined && obj.awayScore !== undefined) {
    const h = canon(obj.homeTeam.name);
    const a = canon(obj.awayTeam.name);
    const gh = parseInt(obj.homeScore?.score ?? obj.homeScore);
    const ga = parseInt(obj.awayScore?.score ?? obj.awayScore);
    if (h && a && !isNaN(gh) && !isNaN(ga) && (obj.status === 'FT' || obj.status === 'RESULT' || obj.matchStatus === 'finished')) {
      results[`${h}_${a}`] = [gh, ga];
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') extractFromBBCData(v, results, depth + 1);
  }
}

// ── SOURCE 2 : sofascore (public, no key) ────────────────────────────────────
async function fetchSofascore() {
  const results = {};
  try {
    // Sofascore public tournament endpoint for FIFA World Cup 2026
    // Tournament ID 16 = FIFA World Cup, Season = 2026
    const url = 'https://api.sofascore.com/api/v1/tournament/16/season/63814/events/last/0';
    const res = await fetch(url, {
      headers: { ...HEADERS, 'Referer': 'https://www.sofascore.com/' }
    });
    if (!res.ok) throw new Error(`Sofascore ${res.status}`);
    const data = await res.json();
    const events = data?.events || [];
    console.log(`Sofascore: ${events.length} events`);
    for (const ev of events) {
      if (ev.status?.type !== 'finished') continue;
      const h = canon(ev.homeTeam?.name || '');
      const a = canon(ev.awayTeam?.name || '');
      const gh = ev.homeScore?.current;
      const ga = ev.awayScore?.current;
      if (h && a && gh !== undefined && ga !== undefined) {
        results[`${h}_${a}`] = [gh, ga];
        console.log(`  ✓ ${h} ${gh}-${ga} ${a}`);
      }
    }
    // Also fetch next page
    const url2 = 'https://api.sofascore.com/api/v1/tournament/16/season/63814/events/next/0';
    const res2 = await fetch(url2, { headers: { ...HEADERS, 'Referer': 'https://www.sofascore.com/' } });
    if (res2.ok) {
      const data2 = await res2.json();
      for (const ev of (data2?.events || [])) {
        if (ev.status?.type !== 'finished') continue;
        const h = canon(ev.homeTeam?.name || '');
        const a = canon(ev.awayTeam?.name || '');
        const gh = ev.homeScore?.current;
        const ga = ev.awayScore?.current;
        if (h && a && gh !== undefined && ga !== undefined) {
          results[`${h}_${a}`] = [gh, ga];
        }
      }
    }
  } catch (e) {
    console.warn(`Sofascore failed: ${e.message}`);
  }
  return results;
}

// ── SOURCE 3 : Wikipedia (fallback) ──────────────────────────────────────────
async function fetchWikipedia() {
  const results = {};
  try {
    const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', titles: '2026_FIFA_World_Cup_group_stage',
      prop: 'revisions', rvprop: 'content', rvslots: 'main',
      format: 'json', formatversion: '2'
    });
    const res = await fetch(url, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
    if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
    const json = await res.json();
    const pages = json?.query?.pages;
    const wikitext = (Array.isArray(pages) ? pages[0] : Object.values(pages||{})[0])
      ?.revisions?.[0]?.slots?.main?.content || '';

    console.log(`Wikipedia: ${wikitext.length} chars`);

    // {{fb|CODE}} table rows
    const fbRe = /\{\{fb\|([A-Z]{2,3})\}\}\s*\|\|\s*(\d+)\s*[–\-]\s*(\d+)\s*\|\|\s*\{\{fb\|([A-Z]{2,3})\}\}/g;
    let m;
    while ((m = fbRe.exec(wikitext)) !== null) {
      const h = FIFA_CODE[m[1]], a = FIFA_CODE[m[4]];
      if (h && a) { results[`${h}_${a}`] = [+m[2], +m[3]]; }
    }
    // {{fs match}} blocks
    const fsRe = /\{\{[Ff]s match[\s\S]*?\| *home *= *([^|\n}]+)[\s\S]*?\| *score *= *(\d+)[–\-](\d+)[\s\S]*?\| *away *= *([^|\n}]+)/g;
    while ((m = fsRe.exec(wikitext)) !== null) {
      const h = canon(m[1].replace(/\[\[.*?\|?(.*?)\]\]/g,'$1').trim());
      const a = canon(m[4].replace(/\[\[.*?\|?(.*?)\]\]/g,'$1').trim());
      if (h && a) results[`${h}_${a}`] = [+m[2], +m[3]];
    }
    console.log(`Wikipedia found: ${Object.keys(results).length} results`);
  } catch (e) {
    console.warn(`Wikipedia failed: ${e.message}`);
  }
  return results;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync('data.json', 'utf8')); } catch {}
  const prevResults = prev.results || {};
  const prevEvents  = prev.events  || {};

  console.log(`Previous results: ${Object.keys(prevResults).length} matches`);

  // Try sources in parallel
  const [bbcResults, sofaResults, wikiResults] = await Promise.all([
    fetchBBC(),
    fetchSofascore(),
    fetchWikipedia()
  ]);

  // Merge: sofascore > bbc > wikipedia (most reliable → least)
  const merged = { ...wikiResults, ...bbcResults, ...sofaResults };
  console.log(`Merged: BBC=${Object.keys(bbcResults).length}, Sofa=${Object.keys(sofaResults).length}, Wiki=${Object.keys(wikiResults).length}`);

  // Never go backwards
  const finalResults = Object.keys(merged).length >= Object.keys(prevResults).length
    ? merged : prevResults;

  const out = {
    updated: new Date().toISOString(),
    source: 'auto',
    count: Object.keys(finalResults).length,
    results: finalResults,
    events: prevEvents  // keep manual events intact
  };

  fs.writeFileSync('data.json', JSON.stringify(out, null, 2) + '\n');
  console.log(`✅ Done — ${out.count} matches total.`);
  if (out.count === 0) { console.error('WARNING: 0 results'); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
