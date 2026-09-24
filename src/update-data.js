// src/update-data.js
//
// Version "one-shot" de server.js : ce script s'exécute UNE FOIS, va
// chercher les données sur Grist, les fusionne avec les géométries des
// communes, écrit le résultat dans data/commerces-ruraux-geo.json, puis
// se termine.
//
// Il est destiné à être lancé automatiquement par GitHub Actions (voir
// .github/workflows/update-data.yml), qui commit ensuite le fichier
// généré dans le dépôt. La carte (app.js) charge ce fichier statique
// directement, sans avoir besoin d'un serveur qui tourne en continu.
//
// En local, tu peux toujours le lancer à la main :
//   GRIST_API_KEY=xxxx node src/update-data.js
// (ou via un fichier .env à la racine du projet)

const fs = require("fs");
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const GRIST_API_KEY = (process.env.GRIST_API_KEY || "").trim();

if (!GRIST_API_KEY) {
  console.error(
    "Erreur : la variable GRIST_API_KEY est introuvable. " +
      "Vérifie le fichier .env en local, ou le secret GitHub Actions en CI."
  );
  process.exit(1);
}

// Export CSV "brut" de la table entière, indépendant de toute vue,
// tri ou filtre Grist (qui référencent des colRef internes fragiles :
// s'ils deviennent invalides après une modification de la structure du
// document, Grist renvoie une erreur 500 au lieu d'un message clair).
// Le filtrage (ex. ne garder que les demandes "Votée") est fait côté
// front dans app.js, donc on n'a pas besoin de filtrer ici.
const GRIST_CSV_URL =
  "https://grist.incubateur.anct.gouv.fr/o/anct/api/docs/rWVx4q6bWSaFP9CRJwEvCc/download/csv?tableId=Suivi_des_demandes_commerce_rural";

// update-data.js est dans src/, data/ est au même niveau que src/ à la racine du projet.
const GEOJSON_INPUT_PATH = path.join(__dirname, "..", "data", "geom_ctr.geojson");
const GEOJSON_OUTPUT_PATH = path.join(__dirname, "..", "data", "commerces-ruraux-geo.json");

const CSV_CODE_COLUMN = "Code commune";
const GEOJSON_CODE_PROPERTY = "insee_com";

// -----------------------------------------------------------------------
// Mêmes fonctions que server.js (fetch, parseCsv, normalizeCode,
// buildJoinedGeojson) — logique inchangée.
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

// -----------------------------------------------------------------------
// Exécution unique
// -----------------------------------------------------------------------

async function main() {
  const communesGeojson = JSON.parse(
    fs.readFileSync(GEOJSON_INPUT_PATH, "utf-8")
  );

  const csvText = await fetchGristCsv();
  const csvRows = parseCsv(csvText);
  const joined = buildJoinedGeojson(csvRows, communesGeojson);

  fs.writeFileSync(GEOJSON_OUTPUT_PATH, JSON.stringify(joined, null, 2));

  console.log(
    `Fichier écrit : ${GEOJSON_OUTPUT_PATH} (${joined.features.length} communes).`
  );
}

main().catch((err) => {
  console.error("Erreur lors de la mise à jour des données :", err.message);
  process.exit(1);
});