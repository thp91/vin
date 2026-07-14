// Télécharge l'intégralité des données au format JSON (pièce jointe).
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const raw = await readFile(
      resolve(process.cwd(), "data/wine_bars.json"),
      "utf8",
    );
    const date = new Date().toISOString().slice(0, 10);
    return new Response(raw, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="bars-a-vin-paris-${date}.json"`,
      },
    });
  } catch {
    return new Response("Données indisponibles", { status: 500 });
  }
}
