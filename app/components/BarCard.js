"use client";

import { useState } from "react";

function Stars({ note }) {
  if (!note) return <span className="muted">Pas de note</span>;
  const full = Math.round(note);
  return (
    <span className="stars" aria-label={`${note} sur 5`}>
      {"★".repeat(full)}
      <span className="stars-empty">{"★".repeat(5 - full)}</span>
    </span>
  );
}

// Tags "atmosphère" : on n'affiche que ceux à true.
const TAGS = [
  { key: "sert_vin", label: "🍷 Vin" },
  { key: "sert_biere", label: "🍺 Bière" },
  { key: "sert_cocktails", label: "🍸 Cocktails" },
  { key: "sert_vegetarien", label: "🌿 Végé" },
  { key: "sert_diner", label: "🍽️ Dîner" },
  { key: "terrasse", label: "☀️ Terrasse" },
  { key: "reservable", label: "📅 Réservable" },
  { key: "a_emporter", label: "🥡 À emporter" },
];

export default function BarCard({ bar }) {
  const [showHours, setShowHours] = useState(false);
  const photoName = bar.photos?.[0];
  const photoUrl = photoName
    ? `/api/photo?name=${encodeURIComponent(photoName)}&w=600`
    : null;

  const prix = bar.fourchette_prix ?? bar.niveau_prix;
  const tags = TAGS.filter((t) => bar[t.key] === true);

  return (
    <article className="card">
      <div className="card-photo">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={bar.nom ?? "Bar à vin"} loading="lazy" />
        ) : (
          <div className="card-photo placeholder">🍷</div>
        )}
        {bar.note != null && (
          <span className="badge-note">{bar.note.toFixed(1)}</span>
        )}
      </div>

      <div className="card-body">
        <h3 className="card-title">{bar.nom}</h3>

        <div className="card-rating">
          <Stars note={bar.note} />
          {bar.nombre_avis != null && (
            <span className="reviews">({bar.nombre_avis} avis)</span>
          )}
          {prix && <span className="price">· {prix}</span>}
        </div>

        {bar.adresse && <p className="card-address">{bar.adresse}</p>}

        {tags.length > 0 && (
          <ul className="tags">
            {tags.map((t) => (
              <li key={t.key} className="tag">
                {t.label}
              </li>
            ))}
          </ul>
        )}

        {bar.horaires?.length > 0 && (
          <div className="hours">
            <button
              className="hours-toggle"
              onClick={() => setShowHours((s) => !s)}
            >
              {bar.ouvert_actuellement === true && (
                <span className="open">Ouvert</span>
              )}
              {bar.ouvert_actuellement === false && (
                <span className="closed">Fermé</span>
              )}
              Horaires {showHours ? "▲" : "▼"}
            </button>
            {showHours && (
              <ul className="hours-list">
                {bar.horaires.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="card-actions">
          {bar.telephone && (
            <a href={`tel:${bar.telephone}`} className="action">
              📞 {bar.telephone}
            </a>
          )}
          {bar.site && (
            <a
              href={bar.site}
              target="_blank"
              rel="noopener noreferrer"
              className="action"
            >
              🌐 Site
            </a>
          )}
          {bar.google_maps_url && (
            <a
              href={bar.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="action"
            >
              📍 Maps
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
