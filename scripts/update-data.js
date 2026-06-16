/**
 * update-data.js — Multi-source scraper, no API key needed.
 * Node 18+ (built-in fetch).
 *
 * Sources tried in order:
 *  1. Sofascore public API (tournament 16, season 58210) — near real-time
 *  2. Wikipedia group stage page via action=raw (fallback)
 */

const fs = require('node:fs');

const NORM = {
  'mexico': 'Mexique', 'south africa': 'Afrique du Sud',
  'south korea': 'Corée du Sud', 'korea republic': 'Corée du Sud', 'republic of korea': 'Corée du Sud',
  'czechia': 'Tchéquie', 'czech republic': 'Tchéquie',
  'canada': 'Canada', 'bosnia and herzegovina': 'Bosnie-Herzégovine', 'bosnia & herzegovina': 'Bosnie-Herzégovine', 'bih': 'Bosnie-Herzégovine',
  'united states': 'États-Unis', 'usa': 'États-Unis', 'us': 'États-Unis',
  'paraguay': 'Paraguay', 'qatar': 'Qatar', 'switzerland': 'Suisse',
  'brazil': 'Brésil', 'morocco': 'Maroc', 'haiti': 'Haïti',
  'scotland': 'Écosse', 'australia': 'Australie',
  'turkey': 'Turquie', 'türkiye': 'Turquie', 'turkiye': 'Turquie',
  'germany': 'Allemagne', 'curaçao': 'Curaçao', 'curacao': 'Curaçao',
  'netherlands': 'Pays-Bas', 'holland': 'Pays-Bas', 'japan': 'Japon',
  "ivory coast": "Côte d'Ivoire", "côte d'ivoire": "Côte d'Ivoire", "cote d'ivoire": "Côte d'Ivoire", "cote divoire": "Côte d'Ivoire",
  'ecuador': 'Équateur', 'tunisia': 'Tunisie', 'sweden': 'Suède',
  'spain': 'Espagne', 'cape verde': 'Cap-Vert',
  'belgium': 'Belgique', 'egypt': 'Égypte',
  'saudi arabia': 'Arabie Saoudite', 'uruguay': 'Uruguay',
  'iran': 'Iran', 'new zealand': 'Nouvelle-Zélande',
  'france': 'France', 'senegal': 'Sénégal', 'iraq': 'Irak',
  'norway': 'Norvège', 'argentina': 'Argentine', 'algeria': 'Algérie',
  'austria': 'Autriche', 'jordan': 'Jordanie',
  'portugal': 'Portugal', 'dr congo': 'Congo RD', 'congo dr': 'Congo RD', 'democratic republic of congo': 'Congo RD',
  'england': 'Angleterre', 'croatia': 'Croatie',
  'ghana': 'Ghana', 'panama': 'Panama',
  'uzbekistan': 'Ouzbékistan', 'colombia': 'Colombie'
};
const canon = n => NORM[(n||'').trim().toLowerCase()] || (n||'').trim();

const FIFA_CODE = {
  MEX:'Mexique',RSA:'Afrique du Sud',KOR:'Corée du Sud',CZE:'Tchéquie',
  CAN:'Canada',BIH:'Bosnie-Herzégovine',USA:'États-Unis',PAR:'Paraguay',
  QAT:'Qatar',SUI:'Suisse',BRA:'Brésil',MAR:'Maroc',HAI:'Haïti',SCO:'Écosse',
  AUS:'Australie',TUR:'Turquie',GER:'Allemagne',CUW:'Curaçao',NED:'Pays-Bas',
  JPN:'Japon',CIV:"Côte d'Ivoire",ECU:'Équateur',TUN:'Tunisie',SWE:'Suède',
  ESP:'Espagne',CPV:'Cap-Vert',BEL:'Belgique',EGY:'Égypte',KSA:'Arabie Saoudite',
  URU:'Uruguay',IRN:'Iran',NZL:'Nouvelle-Zélande',FRA:'France',SEN:'Sénégal',
  IRQ:'Irak',NOR:'Norvège',ARG:'Argentine',ALG:'Algérie',AUT:'Autriche',
  JOR:'Jordanie',POR:'Portugal',COD:'Congo RD',DCO:'Congo RD',ENG:'Angleterre',CRO:'Croatie',
  GHA:'Ghana',PAN:'Panama',UZB:'Ouzbékistan',COL:'Colombie',DZA:'Algérie'
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.sofascore.com/'
};

// ── SOURCE 1: Sofascore — unique tournament 16, season 58210 ────────────────
async function fetchSofascore() {
  const results = {};
  const bases = [
    'https://api.sofascore.com/api/v1',
    'https://www.sofascore.com/api/v1'
  ];
  const paths = [
    '/unique-tournament/16/season/58210/events/last/0',
    '/unique-tournament/16/season/58210/events/last/1',
    '/unique-tournament/16/season/58210/events/last/2'
  ];

  for (const base of bases) {
    for (const path of paths) {
      try {
        const res = await fetch(base + path, { headers: HEADERS });
        console.log(`Sofascore ${base}${path} -> ${res.status}`);
        if (!res.ok) continue;
        const data = await res.json();
        const evs = data?.events || [];
        console.log(`  -> ${evs.length} events`);
        for (const ev of evs) {
          if (ev.status?.type !== 'finished') continue;
          const h = canon(ev.homeTeam?.name || '');
          const a = canon(ev.awayTeam?.name || '');
          const gh = ev.homeScore?.current;
          const ga = ev.awayScore?.current;
          if (h && a && gh !== undefined && ga !== undefined) {
            results[`${h}_${a}`] = [gh, ga];
            console.log(`  OK ${h} ${gh}-${ga} ${a}`);
          }
        }
      } catch (e) {
        console.warn(`  Sofascore ${path} failed: ${e.message}`);
      }
    }
    if (Object.keys(results).length > 0) break;
  }

  return results;
}

// ── SOURCE 2: Wikipedia via action=raw (fallback) ────────────────────────────
async function fetchWikipedia() {
  const results = {};
  try {
    const url = 'https://en.wikipedia.org/w/index.php?title=2026_FIFA_World_Cup_group_stage&action=raw';
    const res = await fetch(url, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
    console.log(`Wikipedia (raw) -> ${res.status}`);
    let wikitext = '';
    if (res.ok) {
      wikitext = await res.text();
    } else {
      const url2 = 'https://en.wikipedia.org/api/rest_v1/page/wikitext/2026_FIFA_World_Cup_group_stage';
      const res2 = await fetch(url2, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
      console.log(`Wikipedia (rest_v1) -> ${res2.status}`);
      if (res2.ok) wikitext = await res2.text();
    }
    console.log(`Wikipedia content: ${wikitext.length} chars`);
    if (wikitext.length > 0) console.log(`Wikipedia sample: ${wikitext.slice(0, 150).replace(/\n/g,' ')}`);

    const fbRe = /\{\{fb\|([A-Z]{2,3})\}\}\s*\|\|\s*(\d+)\s*[–\-]\s*(\d+)\s*\|\|\s*\{\{fb\|([A-Z]{2,3})\}\}/g;
    let m;
    while ((m = fbRe.exec(wikitext)) !== null) {
      const h = FIFA_CODE[m[1]], a = FIFA_CODE[m[4]];
      if (h && a) results[`${h}_${a}`] = [+m[2], +m[3]];
    }
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

  console.log(`Previous: ${Object.keys(prevResults).length} matches`);

  const [sofaResults, wikiResults] = await Promise.all([fetchSofascore(), fetchWikipedia()]);

  const merged = { ...wikiResults, ...sofaResults };
  console.log(`Sofascore=${Object.keys(sofaResults).length}, Wiki=${Object.keys(wikiResults).length}, Merged=${Object.keys(merged).length}`);

  const finalResults = Object.keys(merged).length >= Object.keys(prevResults).length
    ? merged : prevResults;

  const out = {
    updated: new Date().toISOString(),
    source: 'auto',
    count: Object.keys(finalResults).length,
    results: finalResults,
    events: prevEvents
  };

  fs.writeFileSync('data.json', JSON.stringify(out, null, 2) + '\n');
  console.log(`Done -- ${out.count} matches.`);
  if (out.count === 0) { console.error('WARNING: 0 results'); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
