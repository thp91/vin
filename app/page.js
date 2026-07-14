import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import BarList from "./components/BarList";

// Relire le JSON à chaque requête (données fraîches après un rescrape).
export const dynamic = "force-dynamic";

// Lecture du JSON côté serveur (au build / à la requête).
async function getBars() {
  try {
    const raw = await readFile(
      resolve(process.cwd(), "data/wine_bars.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default async function Home() {
  const bars = await getBars();

  const noteMoyenne =
    bars.filter((b) => b.note).reduce((s, b) => s + b.note, 0) /
    (bars.filter((b) => b.note).length || 1);

  return (
    <main>
      <header className="hero">
        <div className="hero-inner">
          <p className="eyebrow">Paris · Guide indépendant</p>
          <h1>
            Les bars à vin
            <br />
            de Paris
          </h1>
          <p className="subtitle">
            {bars.length} adresses référencées, notées et géolocalisées.
          </p>
          <div className="stats">
            <div className="stat">
              <span className="stat-num">{bars.length}</span>
              <span className="stat-label">bars à vin</span>
            </div>
            <div className="stat">
              <span className="stat-num">
                {bars.length ? noteMoyenne.toFixed(1) : "—"}
              </span>
              <span className="stat-label">note moyenne</span>
            </div>
            <div className="stat">
              <span className="stat-num">
                {bars.reduce((s, b) => s + (b.nombre_avis || 0), 0).toLocaleString(
                  "fr-FR",
                )}
              </span>
              <span className="stat-label">avis cumulés</span>
            </div>
          </div>

          {bars.length > 0 && (
            <div className="download-group">
              <a href="/api/download" className="download-btn" download>
                ⬇ Télécharger (JSON)
              </a>
              <a
                href="/api/download-excel"
                className="download-btn download-btn-excel"
                download
              >
                ⬇ Télécharger (Excel)
              </a>
            </div>
          )}
        </div>
      </header>

      {bars.length === 0 ? (
        <div className="empty">
          <h2>Aucune donnée pour l'instant</h2>
          <p>
            Lance le scraper pour peupler l'annuaire :
            <br />
            <code>npm run scrape</code>
          </p>
        </div>
      ) : (
        <BarList bars={bars} />
      )}

      <footer className="footer">
        <p>
          Données : Google Places API. L'email n'est pas fourni par l'API.
        </p>
      </footer>
    </main>
  );
}
