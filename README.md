# World Cup 2026 — Paris-time tracker

A single static page (`index.html`) — all 104 matches in Paris time, free viewing
channels per language, live group standings, the full knockout bracket, and a
**click-to-expand goal/card timeline** on every finished match. Results + events
auto-refresh from API-Football via a scheduled GitHub Action. **No API key ever
reaches the browser**, and your viewers consume zero API quota.

## How it works

```
GitHub Action (every 20 min)
   |- scripts/update-data.js   (key is a repo secret, server-side)
   |    |- 1 call: all fixtures + scores
   |    |- events fetched ONCE per finished match, then cached forever
   |    |- writes data.json -> commits -> GitHub Pages redeploys
   |         |- index.html fetches data.json and re-renders
```

Latest scores are also baked into `index.html` as a fallback, so it still works
opened locally / offline.

## Setup (~10 min)

### 1. Get a free API-Football key
Register at https://dashboard.api-football.com/register , confirm your email,
copy the API key from the dashboard. Free plan = ~100 requests/day (plenty for
this). World Cup data lives at league=1 & season=2026.

### 2. Put the files in a PUBLIC GitHub repo
    index.html
    data.json
    scripts/update-data.js
    .github/workflows/update-data.yml
Public repo = free unlimited Action minutes and free GitHub Pages.

### 3. Add the key as a secret
Repo -> Settings -> Secrets and variables -> Actions -> New repository secret
  Name:  APIFOOTBALL_KEY
  Value: your key

### 4. Turn on the updater
Actions tab -> enable workflows -> run "Update World Cup data" -> "Run workflow"
once to confirm it writes data.json. Then it runs every 20 minutes on its own.

### 5. Host on GitHub Pages
Settings -> Pages -> Source: Deploy from a branch -> main / root.
You get https://YOURNAME.github.io/REPO/ — send that link to your friends.
Every commit from the Action redeploys it automatically.

## Request budget (why 20 min is safe)
- 1 call per run for all fixtures/scores -> ~72 calls/day at a 20-min cron.
- Events: 1 call per finished match, only the FIRST time (cached in data.json).
  ~104 total across the whole tournament; a busy group day adds ~16.
- 72 + ~16 ~= 88/day, under the ~100/day free cap. Want more margin? Use */30 (48/day).

## Editing by hand (no API)
Edit data.json. results keys are "Home_Away": [home, away]. events are
"Home_Away": [ {t:"goal"|"yellow"|"red", m:minute, x:extraMin?, team, p:player,
a:assist?, d:detail?} ]. The page accepts either team order and recomputes
standings automatically.

## Notes
- Team spellings are mapped in the script (e.g. "Czech Republic" -> "Czechia",
  "Turkey" -> "Türkiye"). Check the first Action run's log for any unmapped name.
- Bracket winners/runners-up fill by group position; third-place slots stay
  generic until all groups finish (the official 495-combination table). Reading
  the knockout fixtures from the API after 27 June is a clean future add-on.
- Scheduled Actions run on UTC and can be delayed a few minutes under load.
