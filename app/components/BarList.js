"use client";

import { useMemo, useState } from "react";
import BarCard from "./BarCard";

// Noms des départements pour un affichage lisible (fallback = code).
const DEPT_NAMES = {
  75: "Paris",
  77: "Seine-et-Marne",
  78: "Yvelines",
  91: "Essonne",
  92: "Hauts-de-Seine",
  93: "Seine-Saint-Denis",
  94: "Val-de-Marne",
  95: "Val-d'Oise",
};

export default function BarList({ bars }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("note");
  const [minNote, setMinNote] = useState(0);
  const [dept, setDept] = useState("all");

  // Liste des départements présents dans les données, avec compteur.
  const depts = useMemo(() => {
    const counts = {};
    for (const b of bars) {
      const d = b.departement ?? "?";
      counts[d] = (counts[d] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [bars]);

  const filtered = useMemo(() => {
    let list = bars.filter((b) => {
      const matchQuery =
        !query ||
        (b.nom ?? "").toLowerCase().includes(query.toLowerCase()) ||
        (b.adresse ?? "").toLowerCase().includes(query.toLowerCase());
      const matchNote = (b.note ?? 0) >= minNote;
      const matchDept = dept === "all" || (b.departement ?? "?") === dept;
      return matchQuery && matchNote && matchDept;
    });

    list = [...list].sort((a, b) => {
      if (sort === "note") return (b.note ?? 0) - (a.note ?? 0);
      if (sort === "avis") return (b.nombre_avis ?? 0) - (a.nombre_avis ?? 0);
      if (sort === "nom")
        return (a.nom ?? "").localeCompare(b.nom ?? "", "fr");
      return 0;
    });
    return list;
  }, [bars, query, sort, minNote, dept]);

  return (
    <section className="content">
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Rechercher un bar ou une adresse…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="controls">
          <label>
            Département
            <select value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="all">Tous ({bars.length})</option>
              {depts.map(([code, count]) => (
                <option key={code} value={code}>
                  {code === "?"
                    ? "Inconnu"
                    : `${code} · ${DEPT_NAMES[code] ?? "—"}`}{" "}
                  ({count})
                </option>
              ))}
            </select>
          </label>
          <label>
            Trier
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="note">Meilleure note</option>
              <option value="avis">Plus d'avis</option>
              <option value="nom">Nom (A→Z)</option>
            </select>
          </label>
          <label>
            Note min
            <select
              value={minNote}
              onChange={(e) => setMinNote(Number(e.target.value))}
            >
              <option value={0}>Toutes</option>
              <option value={4}>4★ et +</option>
              <option value={4.5}>4,5★ et +</option>
            </select>
          </label>
        </div>
      </div>

      <p className="result-count">
        {filtered.length} bar{filtered.length > 1 ? "s" : ""} affiché
        {filtered.length > 1 ? "s" : ""}
        {dept !== "all" &&
          ` · département ${dept}${DEPT_NAMES[dept] ? " (" + DEPT_NAMES[dept] + ")" : ""}`}
      </p>

      <div className="grid">
        {filtered.map((bar) => (
          <BarCard key={bar.place_id} bar={bar} />
        ))}
      </div>
    </section>
  );
}
