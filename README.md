# 🏆 World Cup 2026 — Heure de Paris

Suivi en temps réel de la Coupe du Monde 2026 : 104 matchs en heure de Paris, classements de groupes, tableau final, et guide chaînes gratuites.

🔗 **Site live : [worldcup2026.nabil-ech.workers.dev](https://worldcup2026.nabil-ech.workers.dev)**

---

## Fonctionnalités

- 📅 **Calendrier** — 104 matchs en heure de Paris (CEST), avec badge "lendemain" pour les matchs de nuit
- 📊 **Classements** — mis à jour après chaque match, top 2 qualifiés en vert
- 🏆 **Tableau final** — bracket complet R32 → R16 → QF → SF → Finale, avec destination de chaque groupe
- 📺 **Regarder gratis** — chaînes gratuites en 🇫🇷 français (M6/RTBF/RTS), 🇬🇧 anglais (BBC/ITV), 🇪🇸 espagnol (RTVE)
- ⚽ **Détails des matchs** — buts et cartons minute par minute (clic pour dérouler)
- 🔍 **Filtre par pays** — dropdown avec tous les 48 pays, multi-sélection
- 📆 **Export calendrier** — ajouter un ou plusieurs matchs à Google Calendar / Apple Calendar (.ics)
- 🌙 **Mode nuit** — toggle en haut à droite, préférence sauvegardée

---

## Mise à jour des résultats

L'API football gratuite ne couvre pas la saison 2026. Les résultats sont mis à jour **manuellement** dans `data.json`.

### Format `data.json`

```json
{
  "updated": "2026-06-14T14:30:00.000Z",
  "source": "manual",
  "count": 8,
  "results": {
    "Équipe1_Équipe2": [buts1, buts2]
  },
  "events": {
    "Équipe1_Équipe2": [
      { "t": "goal", "m": 22, "team": "Équipe1", "p": "Nom Joueur" },
      { "t": "yellow", "m": 45, "team": "Équipe2", "p": "Nom Joueur" },
      { "t": "red", "m": 78, "team": "Équipe1", "p": "Nom Joueur" }
    ]
  }
}
```

**Types d'événements :** `goal`, `yellow`, `red`  
**Champs optionnels :** `x` (minutes de prolongation), `a` (passeur), `d` (détail ex: "Penalty")  
**Noms en français** — les clés doivent correspondre aux noms utilisés dans `index.html`

### Résultats au 14 juin 2026 (8 matchs)

| Match | Score |
|-------|-------|
| Mexique - Afrique du Sud | 2-0 |
| Corée du Sud - Tchéquie | 2-1 |
| Canada - Bosnie-Herzégovine | 1-1 |
| États-Unis - Paraguay | 4-1 |
| Qatar - Suisse | 1-1 |
| Brésil - Maroc | 1-1 |
| Haïti - Écosse | 0-1 |
| Australie - Turquie | 2-0 |

---

## Structure du repo

```
index.html          ← page complète (HTML/CSS/JS en un seul fichier)
data.json           ← résultats et événements (mise à jour manuelle)
scripts/
  update-data.js    ← script API (désactivé, free tier ne couvre pas 2026)
.github/workflows/
  update-data.yml   ← GitHub Action (désactivée)
```

---

## Hébergement

Hébergé sur **Cloudflare Pages** (gratuit) connecté à ce repo GitHub.  
Chaque commit sur `main` redéploie automatiquement le site en ~30 secondes.

Pour mettre à jour les scores : modifier `data.json` → commit → le site se met à jour.
