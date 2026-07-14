# 🍷 Bars à vin de Paris

Annuaire des bars à vin de Paris, alimenté par l'**API Google Places (New)** et
affiché via un site **Next.js**.

## Ce qui est récupéré pour chaque bar

| Champ | Source Google Places |
|---|---|
| Nom | ✅ `displayName` |
| Adresse | ✅ `formattedAddress` |
| Latitude / Longitude | ✅ `location` |
| Horaires | ✅ `regularOpeningHours` |
| Note | ✅ `rating` |
| Nombre d'avis | ✅ `userRatingCount` |
| Téléphone | ✅ `nationalPhoneNumber` |
| Site web | ✅ `websiteUri` |
| Photos | ✅ `photos` (servies via `/api/photo`) |
| Place ID | ✅ `id` |
| **Email** | ❌ **non fourni par l'API Google Places** (champ laissé à `null`, enrichissable manuellement) |

## Installation

```bash
npm install
```

Copie `.env.local.example` en `.env.local` et colle ta clé Google (avec
**Places API (New)** activée) :

```
GOOGLE_PLACES_API_KEY=ta_cle
```

## Scraper les données

```bash
# Par département (registre Île-de-France : 75, 92, 93, 94)
npm run scrape -- --dept 92

# Toujours estimer d'abord le coût, SANS appeler l'API :
npm run scrape -- --dept 92 --dry-run

# Zone par défaut : Paris intra-muros (rayon 6 km)
npm run scrape

# Zone personnalisée (centre + rayon + finesse de grille)
npm run scrape -- --lat 48.86 --lng 2.35 --radius 2000 --step 700

# Rafraîchir tout (rescrape le territoire déjà couvert)
npm run scrape -- --dept 75 --force
```

Les résultats sont écrits dans `data/wine_bars.json`. Chaque bar reçoit un champ
`departement` (déduit du code postal), utilisé par le filtre du site.

### Suivi de couverture (anti-gaspillage)

Le scraper mémorise les cellules déjà scrapées dans `data/coverage.json` et
**ignore automatiquement** le territoire déjà couvert au run suivant : on ne
paie que pour le neuf. `--force` pour tout rescraper.

### Garde-fou budget (anti-facturation)

`MONTHLY_REQUEST_LIMIT` dans `.env.local` plafonne le nombre de requêtes/mois.
Le scraper **refuse** de dépasser (blocage local, aucune facturation), suivi
dans `data/usage.json` (remise à zéro chaque mois).

### Anti-doublons

La déduplication se fait sur le `place_id` :
- pendant le scrape, les cellules de la grille qui se chevauchent sont fusionnées ;
- au **rescrape d'une même zone**, les fiches existantes sont **mises à jour**
  et seules les nouvelles sont **ajoutées** — jamais de doublon.
- un `email` renseigné à la main est **préservé** lors des rescrapes.

## Lancer le site

```bash
npm run dev
# http://localhost:3000
```

## Architecture

```
scripts/scrape.mjs        Scraper (grille de cercles + dédup par place_id)
data/wine_bars.json       Base de données JSON
app/page.js               Page d'accueil (lit le JSON côté serveur)
app/components/BarList.js  Recherche / tri / filtres (client)
app/components/BarCard.js  Carte d'un bar
app/api/photo/route.js    Proxy photos (garde la clé API côté serveur)
app/api/download/route.js       Export JSON (téléchargement)
app/api/download-excel/route.js Export Excel .xlsx (via exceljs)
```

## Exports

Deux boutons dans le hero du site :
- **JSON** → `/api/download` (le fichier `data/wine_bars.json` complet)
- **Excel** → `/api/download-excel` (`.xlsx` mis en forme : en-têtes, filtres auto,
  ligne figée ; booléens en Oui/Non)
