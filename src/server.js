// server.js
//
// Remplace build-data.js : au lieu d'écrire un fichier une fois de temps
// en temps, ce script tourne EN PERMANENCE sur le serveur (via l'app
// Node.js de ton hébergeur) et répond à chaque requête de la carte avec
// les données Grist + géométries jointes.
//
// La clé Grist reste ici, côté serveur : elle n'est jamais envoyée au
// navigateur des visiteurs.
//
// Un cache en mémoire évite de sur-solliciter Grist : les données ne
// sont recalculées que si elles ont plus de CACHE_DURATION_MS.
//
// Installation (une seule fois, via l'interface Node.js de ton
// hébergeur, bouton "Run NPM Install", ou en SSH si tu y as accès) :
//   npm install express node-fetch dotenv
//
// Démarrage : géré automatiquement par l'app Node.js de ton hébergeur
// (elle exécute ce fichier en continu). Le fichier .env doit contenir
// GRIST_API_KEY=xxxx à la racine du projet, OU la variable doit être
// définie directement dans l'interface Node.js de ton hébergeur.

const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const GRIST_API_KEY = process.env.GRIST_API_KEY;

if (!GRIST_API_KEY) {
  console.error(
    "Erreur : la variable GRIST_API_KEY est introuvable. " +
      "Vérifie le fichier .env ou la config Node.js de ton hébergeur."
  );
  process.exit(1);
}

// Durée de vie du cache avant de rappeler Grist (en millisecondes).
// 10 minutes ici — modifie cette valeur si tu veux plus ou moins "temps réel".
const CACHE_DURATION_MS = 10 * 60 * 1000;

// Port fourni par l'hébergeur (obligatoire pour la plupart des configs
// Node.js mutualisées type cPanel/Plesk) ou 3000 par défaut en local.
const PORT = process.env.PORT || 5500;

// Export CSV "brut" de la table entière, indépendant de toute vue,
// tri ou filtre Grist (qui référencent des colRef internes fragiles).
// Le filtrage est fait côté front dans app.js.
const GRIST_CSV_URL =
  "https://grist.incubateur.anct.gouv.fr/o/anct/api/docs/rWVx4q6bWSaFP9CRJwEvCc/download/csv?tableId=Suivi_des_demandes_commerce_rural";

// server.js est dans src/, data/ est au même niveau que src/ à la racine du projet.
const GEOJSON_INPUT_PATH = path.join(__dirname, "..", "data", "geom_ctr.geojson");

const CSV_CODE_COLUMN = "Code commune";
const GEOJSON_CODE_PROPERTY = "insee_com";

// -----------------------------------------------------------------------
// Mêmes fonctions que build-data.js (fetch, parseCsv, normalizeCode,
// buildJoinedGeojson) — logique inchangée, juste réutilisée ici.
// -----------------------------------------------------------------------

async function fetchGristCsv() {
  const response = await fetch(GRIST_CSV_URL, {
    headers: { Authorization: `Bearer ${GRIST_API_KEY}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Échec de la requête Grist : ${response.status} ${response.statusText}` +
        (body ? ` — ${body.slice(0, 500)}` : "")
    );
  }

  return response.text();
}

function parseCsv(csvText) {
  const rows = [];
  const lines = csvText.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return rows;

  const parseLine = (line) => {
    const values = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  };

  const headers = parseLine(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

function normalizeCode(code) {
  if (code === null || code === undefined) return "";
  return String(code).trim();
}

function buildJoinedGeojson(csvRows, geojson) {
  const geomByCode = new Map();
  for (const feature of geojson.features) {
    const code = normalizeCode(feature.properties[GEOJSON_CODE_PROPERTY]);
    geomByCode.set(code, feature);
  }

  const features = [];
  const nonTrouves = [];

  for (const row of csvRows) {
    const code = normalizeCode(row[CSV_CODE_COLUMN]);
    const match = geomByCode.get(code);

    if (!match) {
      nonTrouves.push(code);
      continue;
    }

    features.push({
      type: "Feature",
      geometry: match.geometry,
      properties: {
        ...row,
        insee_com: code,
        libgeo: match.properties.libgeo || row["Ville"] || "",
      },
    });
  }

  if (nonTrouves.length > 0) {
    console.warn(
      `${nonTrouves.length} ligne(s) sans géométrie correspondante.`
    );
  }

  return {
    type: "FeatureCollection",
    generated_at: new Date().toISOString(),
    features,
  };
}

// Le geojson des communes ne change jamais : on le charge une seule fois
// au démarrage plutôt qu'à chaque requête.
let communesGeojson;
try {
  communesGeojson = JSON.parse(fs.readFileSync(GEOJSON_INPUT_PATH, "utf-8"));
} catch (err) {
  console.error(
    `Impossible de charger ${GEOJSON_INPUT_PATH} :`,
    err.message
  );
  process.exit(1);
}

// -----------------------------------------------------------------------
// Cache en mémoire
// -----------------------------------------------------------------------

let cache = {
  data: null,
  fetchedAt: 0,
};

async function getFreshData() {
  const now = Date.now();
  const isStale = now - cache.fetchedAt > CACHE_DURATION_MS;

  if (cache.data && !isStale) {
    return cache.data;
  }

  try {
    const csvText = await fetchGristCsv();
    const csvRows = parseCsv(csvText);
    const joined = buildJoinedGeojson(csvRows, communesGeojson);

    cache = { data: joined, fetchedAt: now };
    console.log(
      `[${new Date().toISOString()}] Données rafraîchies : ${joined.features.length} communes.`
    );
    return joined;
  } catch (err) {
    console.error("Erreur lors du rafraîchissement Grist :", err.message);

    // En cas d'échec (Grist indisponible, etc.), on sert l'ancien cache
    // plutôt que de casser la carte, s'il en existe un.
    if (cache.data) {
      console.warn("Service des données en cache (potentiellement anciennes).");
      return cache.data;
    }

    throw err;
  }
}

// -----------------------------------------------------------------------
// Serveur HTTP
// -----------------------------------------------------------------------

const app = express();

// Autorise ta carte à appeler cette API même si elle est servie depuis
// un autre sous-domaine/chemin. Restreins à ton domaine si tu préfères.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

app.get("/commerces-ruraux-geo.json", async (req, res) => {
  try {
    const data = await getFreshData();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: "Données indisponibles pour le moment." });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur de données démarré sur le port ${PORT}`);
});