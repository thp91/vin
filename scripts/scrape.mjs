/**
 * Scraper des bars à vin (wine_bar) via Google Places API (New).
 *
 * Principe :
 *  - On couvre une ZONE (centre + rayon) en la "tuilant" avec une grille de
 *    petits cercles. Google limite Nearby Search à 20 résultats par appel et
 *    ne pagine pas : la grille permet donc de couvrir tout le secteur.
 *  - Chaque appel searchNearby demande directement TOUS les champs utiles
 *    (nom, adresse, horaires, note, avis, téléphone, site, photos, geo, id).
 *  - DÉDUPLICATION par place_id : on fusionne dans data/wine_bars.json.
 *    Un rescrape sur la même zone met à jour les fiches existantes et ajoute
 *    seulement les nouvelles → aucun doublon.
 *
 * Usage :
 *   npm run scrape                       # zone par défaut (Paris intra-muros)
 *   npm run scrape -- --dept 92          # scrape un département entier (registre IDF)
 *   npm run scrape -- --lat 48.86 --lng 2.35 --radius 2000 --step 700
 *
 * Options :
 *   --dept <code>  Scrape un département via le registre (75, 92, 93, 94)
 *   --lat, --lng   Centre de la zone (défaut : centre de Paris)
 *   --radius       Rayon de la zone en mètres (défaut : 6000)
 *   --step         Espacement de la grille en mètres (défaut : 900)
 *   --query        Type de lieu Google (défaut : wine_bar)
 *   --dry-run      Calcule le nb de requêtes + coût estimé SANS appeler l'API
 *   --force        Rescrape aussi le territoire déjà couvert
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, "../data/wine_bars.json");

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";

// Champs demandés à Google (field mask). "*" coûterait plus cher : on cible.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.regularOpeningHours",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.photos",
  "places.types",
  "places.businessStatus",
  // Champs "atmosphère" (même tier tarifaire, donc sans surcoût)
  "places.priceLevel",
  "places.priceRange",
  "places.servesWine",
  "places.servesBeer",
  "places.servesCocktails",
  "places.servesVegetarianFood",
  "places.servesDinner",
  "places.reservable",
  "places.outdoorSeating",
  "places.takeout",
  "places.delivery",
  "places.dineIn",
].join(",");

// Mapping du niveau de prix Google -> symboles €
const PRICE_MAP = {
  PRICE_LEVEL_FREE: "Gratuit",
  PRICE_LEVEL_INEXPENSIVE: "€",
  PRICE_LEVEL_MODERATE: "€€",
  PRICE_LEVEL_EXPENSIVE: "€€€",
  PRICE_LEVEL_VERY_EXPENSIVE: "€€€€",
};

function formatPriceRange(pr) {
  if (!pr) return null;
  const start = pr.startPrice?.units;
  const end = pr.endPrice?.units;
  if (start && end) return `${start}–${end} €`;
  if (start) return `dès ${start} €`;
  return null;
}

// ---------- Parsing des arguments CLI ----------
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      // Flag booléen si aucune valeur ne suit (fin, ou autre --option).
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

// Registre des départements d'Île-de-France : centre + rayon + pas de grille
// pré-réglés. La banlieue est moins dense → pas plus large (moins de cellules).
const DEPT_REGISTRY = {
  "75": { lat: 48.8566, lng: 2.3522, radius: 6000, step: 650 },
  "92": { lat: 48.8200, lng: 2.2400, radius: 9000, step: 1100 },
  "93": { lat: 48.9100, lng: 2.4500, radius: 9000, step: 1100 },
  "94": { lat: 48.7800, lng: 2.4600, radius: 8500, step: 1100 },
};

const args = parseArgs(process.argv.slice(2));

// Résolution du département demandé (--dept).
let deptCfg = null;
if (args.dept) {
  if (args.dept === true) {
    console.error("❌ Précise un code : --dept 92 (dispo : 75, 92, 93, 94)");
    process.exit(1);
  }
  deptCfg = DEPT_REGISTRY[String(args.dept)];
  if (!deptCfg) {
    console.error(
      `❌ Département "${args.dept}" inconnu du registre (dispo : ${Object.keys(DEPT_REGISTRY).join(", ")}).\n` +
        `   Tu peux aussi passer --lat/--lng/--radius manuellement pour n'importe quelle zone.`,
    );
    process.exit(1);
  }
}

const CONFIG = {
  // Priorité : argument explicite > registre département > défaut Paris.
  lat: parseFloat(args.lat ?? deptCfg?.lat ?? "48.8566"),
  lng: parseFloat(args.lng ?? deptCfg?.lng ?? "2.3522"),
  radius: parseFloat(args.radius ?? deptCfg?.radius ?? "6000"),
  step: parseFloat(args.step ?? deptCfg?.step ?? "900"),
  dept: args.dept ? String(args.dept) : null,
  includedType: args.query ?? "wine_bar",
  dryRun: "dry-run" in args || process.argv.includes("--dry-run"),
  // --force : rescrape tout, y compris le territoire déjà couvert.
  force: "force" in args || process.argv.includes("--force"),
};

// Coût estimé par requête (tier Enterprise + Atmosphere, le plus élevé car on
// demande horaires/note/téléphone). Hors crédit mensuel gratuit de Google.
const COST_PER_REQUEST_USD = 0.04;

// ---------- Garde-fou : budget mensuel de requêtes ----------
// Blocage local, indépendant de Google. Par défaut 900/mois pour rester sous
// un palier gratuit de 1000. Configurable via MONTHLY_REQUEST_LIMIT dans .env.local
const MONTHLY_LIMIT = parseInt(process.env.MONTHLY_REQUEST_LIMIT ?? "900", 10);
const USAGE_PATH = resolve(__dirname, "../data/usage.json");

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // "2026-07"
}

async function loadUsage() {
  if (!existsSync(USAGE_PATH)) return { month: currentMonth(), count: 0 };
  try {
    const u = JSON.parse(await readFile(USAGE_PATH, "utf8"));
    // Réinitialise si on a changé de mois.
    if (u.month !== currentMonth()) return { month: currentMonth(), count: 0 };
    return u;
  } catch {
    return { month: currentMonth(), count: 0 };
  }
}

async function saveUsage(usage) {
  await mkdir(dirname(USAGE_PATH), { recursive: true });
  await writeFile(USAGE_PATH, JSON.stringify(usage, null, 2), "utf8");
}

// ---------- Suivi de couverture géographique ----------
// On mémorise le centre de chaque cellule déjà scrapée pour, au prochain run,
// ignorer le territoire déjà couvert et ne dépenser que sur du neuf.
const COVERAGE_PATH = resolve(__dirname, "../data/coverage.json");

async function loadCoverage() {
  if (!existsSync(COVERAGE_PATH)) return [];
  try {
    const c = JSON.parse(await readFile(COVERAGE_PATH, "utf8"));
    return Array.isArray(c) ? c : [];
  } catch {
    return [];
  }
}

async function saveCoverage(list) {
  await mkdir(dirname(COVERAGE_PATH), { recursive: true });
  await writeFile(COVERAGE_PATH, JSON.stringify(list, null, 2), "utf8");
}

// Distance approximative en mètres entre deux points.
function distanceM(a, b) {
  const latM = (a.lat - b.lat) * METERS_PER_DEG_LAT;
  const lngM =
    (a.lng - b.lng) * METERS_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(latM * latM + lngM * lngM);
}

// ---------- Génération de la grille ----------
// Rayon de chaque sous-cercle : ≥ pas × 0,71 pour couvrir sans trou entre
// cellules (géométrie d'une grille carrée). Pas de plafond dur : en banlieue
// on utilise un pas plus grand (zones peu denses) → moins de cellules.
const SUB_RADIUS = Math.round(CONFIG.step * 0.72);
const METERS_PER_DEG_LAT = 111_320;

// Département français = 2 premiers chiffres du code postal trouvé dans l'adresse.
function deptFromAddress(adresse) {
  const m = (adresse || "").match(/\b(\d{5})\b/);
  return m ? m[1].slice(0, 2) : null;
}

// Chaînes de cavistes / grossistes à EXCLURE (ce ne sont pas des bars à vin).
// Filtrage par NOM (fiable) — le type "liquor_store" ne l'est pas (présent
// aussi sur de vrais bars à vin).
const CHAIN_BLOCKLIST = [
  /^nicolas\b/i,
  /repaire de bacchus/i,
  /^lavinia\b/i,
  /cavavin/i,
  /\bv\s?(and|&)\s?b\b/i,
  /petit ballon/i,
];

function isChaine(nom) {
  return CHAIN_BLOCKLIST.some((re) => re.test(nom || ""));
}

function buildGrid({ lat, lng, radius, step }) {
  const points = [];
  const latDegStep = step / METERS_PER_DEG_LAT;
  const lngDegStep = step / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const latSpan = radius / METERS_PER_DEG_LAT;
  const lngSpan = radius / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));

  for (let dLat = -latSpan; dLat <= latSpan; dLat += latDegStep) {
    for (let dLng = -lngSpan; dLng <= lngSpan; dLng += lngDegStep) {
      // On ne garde que les cellules dont le centre tombe dans le rayon global.
      const distM = Math.sqrt(
        (dLat * METERS_PER_DEG_LAT) ** 2 +
          (dLng * METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)) ** 2,
      );
      if (distM <= radius) {
        points.push({ lat: lat + dLat, lng: lng + dLng });
      }
    }
  }
  return points;
}

// ---------- Appel API pour une cellule ----------
async function searchCell(center) {
  const body = {
    includedTypes: [CONFIG.includedType],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: SUB_RADIUS,
      },
    },
    languageCode: "fr",
    regionCode: "FR",
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} — ${text}`);
  }

  const json = await res.json();
  return json.places ?? [];
}

// ---------- Normalisation d'une fiche Google -> notre schéma ----------
function normalize(place) {
  return {
    place_id: place.id,
    nom: place.displayName?.text ?? null,
    adresse: place.formattedAddress ?? null,
    departement: deptFromAddress(place.formattedAddress),
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    horaires: place.regularOpeningHours?.weekdayDescriptions ?? null,
    ouvert_actuellement: place.regularOpeningHours?.openNow ?? null,
    note: place.rating ?? null,
    nombre_avis: place.userRatingCount ?? null,
    telephone:
      place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    site: place.websiteUri ?? null,
    email: null, // ⚠️ non fourni par l'API Google Places
    google_maps_url: place.googleMapsUri ?? null,
    // On stocke le "name" de chaque photo (ex: places/XXX/photos/YYY) pour
    // reconstruire l'URL via notre proxy /api/photo côté site.
    photos: (place.photos ?? []).map((p) => p.name),
    types: place.types ?? [],
    statut: place.businessStatus ?? null,
    // Champs "atmosphère"
    niveau_prix: PRICE_MAP[place.priceLevel] ?? null,
    fourchette_prix: formatPriceRange(place.priceRange),
    sert_vin: place.servesWine ?? null,
    sert_biere: place.servesBeer ?? null,
    sert_cocktails: place.servesCocktails ?? null,
    sert_vegetarien: place.servesVegetarianFood ?? null,
    sert_diner: place.servesDinner ?? null,
    reservable: place.reservable ?? null,
    terrasse: place.outdoorSeating ?? null,
    a_emporter: place.takeout ?? null,
    livraison: place.delivery ?? null,
    sur_place: place.dineIn ?? null,
    derniere_maj: new Date().toISOString(),
  };
}

// ---------- Chargement / sauvegarde du JSON existant ----------
async function loadExisting() {
  if (!existsSync(DATA_PATH)) return [];
  try {
    const raw = await readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveData(list) {
  await mkdir(dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(list, null, 2), "utf8");
}

// ---------- Programme principal ----------
async function main() {
  if (!API_KEY || API_KEY === "colle_ta_cle_ici") {
    console.error(
      "❌ Clé API manquante. Renseigne GOOGLE_PLACES_API_KEY dans .env.local",
    );
    process.exit(1);
  }

  const grid = buildGrid(CONFIG);
  console.log(
    `🗺️  Zone : ${CONFIG.dept ? `département ${CONFIG.dept} — ` : ""}centre (${CONFIG.lat}, ${CONFIG.lng}), rayon ${CONFIG.radius} m`,
  );
  console.log(
    `🔎 Grille de ${grid.length} cellules (sous-rayon ${SUB_RADIUS} m), type "${CONFIG.includedType}"`,
  );

  // ---------- Filtrage par couverture déjà scrapée ----------
  const covered = CONFIG.force ? [] : await loadCoverage();
  const toScrape = CONFIG.force
    ? grid
    : grid.filter((cell) => !covered.some((c) => distanceM(cell, c) < SUB_RADIUS));
  const skipped = grid.length - toScrape.length;
  const estCost = (toScrape.length * COST_PER_REQUEST_USD).toFixed(2);

  console.log(
    `🧭 Couverture projet : ${covered.length} cellules déjà scrapées${CONFIG.force ? " (ignorées : --force)" : ""}`,
  );
  console.log(
    `   → ${skipped} cellules déjà couvertes ignorées, ${toScrape.length} NOUVELLES à scraper`,
  );
  console.log(
    `💶 ${toScrape.length} requête(s) — coût max estimé ~${estCost} $ (hors crédit gratuit Google)`,
  );

  // ---------- Garde-fou budget mensuel ----------
  const usage = await loadUsage();
  const remaining = MONTHLY_LIMIT - usage.count;
  console.log(
    `📊 Requêtes ce mois-ci (${usage.month}) : ${usage.count}/${MONTHLY_LIMIT} — reste ${remaining}`,
  );

  if (CONFIG.dryRun) {
    console.log(
      "\n🧪 Mode --dry-run : AUCUN appel API, AUCUNE facturation. Retire --dry-run pour lancer réellement.",
    );
    return;
  }

  if (toScrape.length === 0) {
    console.log(
      "\n✅ Rien de neuf à scraper : toute cette zone est déjà couverte. " +
        "Vise une autre zone (change --lat/--lng/--radius) ou utilise --force pour tout rafraîchir.",
    );
    return;
  }

  if (toScrape.length > remaining) {
    console.error(
      `\n🛑 BLOQUÉ : ce scrape (${toScrape.length} requêtes) dépasserait ton budget mensuel ` +
        `(${remaining} restantes sur ${MONTHLY_LIMIT}).\n` +
        `   Aucune requête envoyée, aucune facturation.\n` +
        `   Options : réduis la zone (--radius / --step plus grand), attends le mois prochain, ` +
        `ou augmente MONTHLY_REQUEST_LIMIT dans .env.local.`,
    );
    process.exit(1);
  }

  // Dédup en mémoire pendant le scrape (une cellule peut chevaucher une autre).
  const scraped = new Map();
  const newlyCovered = [];
  let totalRaw = 0;
  let excluded = 0;

  for (let i = 0; i < toScrape.length; i++) {
    try {
      const places = await searchCell(toScrape[i]);
      // On compte la requête dès qu'elle part et on sauvegarde immédiatement :
      // même en cas de crash, le compteur reste juste.
      usage.count += 1;
      await saveUsage(usage);
      // Cellule effectivement scrapée → on la marque couverte.
      newlyCovered.push({
        lat: +toScrape[i].lat.toFixed(5),
        lng: +toScrape[i].lng.toFixed(5),
      });
      totalRaw += places.length;
      for (const place of places) {
        if (!place.id) continue;
        const bar = normalize(place);
        // On écarte les chaînes de cavistes / grossistes.
        if (isChaine(bar.nom)) {
          excluded++;
          continue;
        }
        scraped.set(place.id, bar);
      }
      process.stdout.write(
        `\r   Cellule ${i + 1}/${toScrape.length} — ${scraped.size} bars uniques trouvés`,
      );
    } catch (err) {
      // On compte aussi les tentatives en erreur, par prudence.
      usage.count += 1;
      await saveUsage(usage);
      console.error(`\n⚠️  Cellule ${i + 1} en erreur : ${err.message}`);
    }
    // Petite pause pour rester correct avec l'API.
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log("");

  // Sauvegarde de la couverture mise à jour (fusion avec l'existante).
  await saveCoverage([...covered, ...newlyCovered]);

  // ---------- Fusion avec l'existant (dédup par place_id) ----------
  const existing = await loadExisting();
  const byId = new Map(existing.map((b) => [b.place_id, b]));

  let added = 0;
  let updated = 0;
  for (const [id, bar] of scraped) {
    if (byId.has(id)) {
      // On conserve un éventuel email enrichi manuellement.
      const prev = byId.get(id);
      byId.set(id, { ...prev, ...bar, email: prev.email ?? bar.email });
      updated++;
    } else {
      byId.set(id, bar);
      added++;
    }
  }

  const finalList = [...byId.values()].sort((a, b) =>
    (a.nom ?? "").localeCompare(b.nom ?? "", "fr"),
  );
  await saveData(finalList);

  console.log("\n✅ Terminé");
  console.log(`   ${totalRaw} résultats bruts renvoyés par Google`);
  console.log(`   ${excluded} exclus (chaînes de cavistes / grossistes)`);
  console.log(`   ${scraped.size} bars uniques sur cette zone`);
  console.log(`   ${added} nouveaux ajoutés, ${updated} mis à jour`);
  console.log(`   ${finalList.length} bars au total dans data/wine_bars.json`);
  console.log(
    `   📊 Budget mensuel : ${usage.count}/${MONTHLY_LIMIT} requêtes utilisées (${MONTHLY_LIMIT - usage.count} restantes)`,
  );
}

main().catch((err) => {
  console.error("\n❌ Erreur fatale :", err.message);
  process.exit(1);
});
