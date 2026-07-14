// Proxy des photos Google Places : la clé API reste côté serveur.
// Le front appelle /api/photo?name=places/XXX/photos/YYY&w=800

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  const width = searchParams.get("w") ?? "800";

  // Validation stricte pour éviter tout SSRF : on n'accepte que des noms
  // de photo Google Places.
  if (!name || !/^places\/[^/]+\/photos\/[^/]+$/.test(name)) {
    return new Response("Paramètre 'name' invalide", { status: 400 });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || key === "colle_ta_cle_ici") {
    return new Response("Clé API non configurée", { status: 500 });
  }

  const url = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${encodeURIComponent(
    width,
  )}&key=${key}`;

  try {
    const upstream = await fetch(url, { redirect: "follow" });
    if (!upstream.ok) {
      return new Response("Photo indisponible", { status: upstream.status });
    }
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const buffer = await upstream.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Cache 30 jours : les photos changent rarement.
        "Cache-Control": "public, max-age=2592000, immutable",
      },
    });
  } catch {
    return new Response("Erreur récupération photo", { status: 502 });
  }
}
