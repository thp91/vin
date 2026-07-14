// Export de toutes les données au format Excel (.xlsx), généré côté serveur.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// true/false/null -> "Oui"/"Non"/"" (plus lisible dans Excel)
const oui = (v) => (v === true ? "Oui" : v === false ? "Non" : "");

export async function GET() {
  let bars;
  try {
    const raw = await readFile(
      resolve(process.cwd(), "data/wine_bars.json"),
      "utf8",
    );
    bars = JSON.parse(raw);
  } catch {
    return new Response("Données indisponibles", { status: 500 });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Bars à vin de Paris";
  const ws = wb.addWorksheet("Bars à vin");

  ws.columns = [
    { header: "Nom", key: "nom", width: 32 },
    { header: "Département", key: "departement", width: 12 },
    { header: "Adresse", key: "adresse", width: 40 },
    { header: "Note", key: "note", width: 8 },
    { header: "Nb avis", key: "nombre_avis", width: 10 },
    { header: "Niveau prix", key: "niveau_prix", width: 12 },
    { header: "Fourchette prix", key: "fourchette_prix", width: 14 },
    { header: "Téléphone", key: "telephone", width: 18 },
    { header: "Site", key: "site", width: 34 },
    { header: "Email", key: "email", width: 22 },
    { header: "Latitude", key: "latitude", width: 12 },
    { header: "Longitude", key: "longitude", width: 12 },
    { header: "Horaires", key: "horaires", width: 50 },
    { header: "Sert vin", key: "sert_vin", width: 9 },
    { header: "Sert bière", key: "sert_biere", width: 10 },
    { header: "Sert cocktails", key: "sert_cocktails", width: 13 },
    { header: "Végétarien", key: "sert_vegetarien", width: 11 },
    { header: "Dîner", key: "sert_diner", width: 8 },
    { header: "Terrasse", key: "terrasse", width: 9 },
    { header: "Réservable", key: "reservable", width: 11 },
    { header: "À emporter", key: "a_emporter", width: 11 },
    { header: "Nb photos", key: "nb_photos", width: 10 },
    { header: "Google Maps", key: "google_maps_url", width: 34 },
    { header: "Place ID", key: "place_id", width: 30 },
    { header: "Statut", key: "statut", width: 14 },
    { header: "Dernière MAJ", key: "derniere_maj", width: 22 },
  ];

  for (const b of bars) {
    ws.addRow({
      nom: b.nom ?? "",
      departement: b.departement ?? "",
      adresse: b.adresse ?? "",
      note: b.note ?? "",
      nombre_avis: b.nombre_avis ?? "",
      niveau_prix: b.niveau_prix ?? "",
      fourchette_prix: b.fourchette_prix ?? "",
      telephone: b.telephone ?? "",
      site: b.site ?? "",
      email: b.email ?? "",
      latitude: b.latitude ?? "",
      longitude: b.longitude ?? "",
      horaires: Array.isArray(b.horaires) ? b.horaires.join(" · ") : "",
      sert_vin: oui(b.sert_vin),
      sert_biere: oui(b.sert_biere),
      sert_cocktails: oui(b.sert_cocktails),
      sert_vegetarien: oui(b.sert_vegetarien),
      sert_diner: oui(b.sert_diner),
      terrasse: oui(b.terrasse),
      reservable: oui(b.reservable),
      a_emporter: oui(b.a_emporter),
      nb_photos: Array.isArray(b.photos) ? b.photos.length : 0,
      google_maps_url: b.google_maps_url ?? "",
      place_id: b.place_id ?? "",
      statut: b.statut ?? "",
      derniere_maj: b.derniere_maj ?? "",
    });
  }

  // En-tête en gras + ligne figée + filtres auto.
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF6B1029" },
  };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "Z1" };

  const buffer = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bars-a-vin-paris-${date}.xlsx"`,
    },
  });
}
