// build-data.js
//
// Étape de "build" : récupère les données depuis Grist (avec la clé API,
// gardée côté serveur — jamais exposée au navigateur), les joint avec
// les géométries des communes (geom_ctr.geojson), et écrit un seul fichier
// GeoJSON prêt à être chargé par la carte (carte-commerces.html).
//
// Installation préalable (une seule fois) :
//   npm install dotenv
//
// Utilisation :
//   node build-data.js
//
// À relancer à chaque fois que tu veux rafraîchir les données de la carte.

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env")
});
const GRIST_API_KEY = process.env.GRIST_API_KEY;

if (!GRIST_API_KEY) {
  console.error(
    "Erreur : la variable GRIST_API_KEY est introuvable. " +
    "Vérifie que le fichier .env existe bien à la racine du projet et contient la clé."
  );
  process.exit(1);
}

// URL de téléchargement CSV fournie par Grist
const GRIST_CSV_URL =
  "https://grist.incubateur.anct.gouv.fr/o/anct/api/docs/rWVx4q6bWSaFP9CRJwEvCc/download/csv" +
  "?viewSection=373" +
  "&tableId=Suivi_des_demandes_commerce_rural" +
  "&activeSortSpec=%5B2641%5D" +
  "&filters=%5B%7B%22colRef%22%3A2636%2C%22filter%22%3A%22%7B%5C%22excluded%5C%22%3A%5B%5D%7D%22%7D%2C%7B%22colRef%22%3A2645%2C%22filter%22%3A%22%7B%5C%22excluded%5C%22%3A%5B%5D%7D%22%7D%5D" +
  "&linkingFilter=%7B%22filters%22%3A%7B%7D%2C%22operations%22%3A%7B%7D%7D";

// Chemins des fichiers locaux (adapte si besoin)
const GEOJSON_INPUT_PATH = path.join(
  __dirname,
  "..",
  "data",
  "geom_ctr.geojson"
);

const OUTPUT_PATH = path.join(
  __dirname,
  "..",
  "data",
  "commerces-ruraux-geo.json"
);

const UPDATE_PATH = path.join(
  __dirname,
  "..",
  "data",
  "last-update.json"
);



console.log(`Fichier écrit : ${UPDATE_PATH}`);


// Noms des colonnes/propriétés utilisées pour la jointure
const CSV_CODE_COLUMN = "Code commune";
const GEOJSON_CODE_PROPERTY = "insee_com";

/**
 * Récupère le CSV brut depuis Grist.
 */
async function fetchGristCsv() {
  const response = await fetch(GRIST_CSV_URL, {
    headers: {
      Authorization: `Bearer ${GRIST_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Échec de la requête Grist : ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

/**
 * Parse un CSV simple en tableau d'objets (une ligne = un objet).
 * Gère les champs entre guillemets et les virgules internes.
 */
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

/**
 * Joint les lignes CSV avec les géométries GeoJSON sur le code commune.
 * Retourne une FeatureCollection GeoJSON où chaque feature = un point
 * avec toutes les colonnes du CSV comme propriétés.
 */
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
        libgeo: match.properties.libgeo || row["Ville"] || "",      },
    });
  }

  if (nonTrouves.length > 0) {
    console.warn(
      `${nonTrouves.length} ligne(s) sans géométrie correspondante :`,
      nonTrouves
    );
  }
  console.log(
    `Jointure réussie : ${features.length}/${csvRows.length}`
  );
  return {
    type: "FeatureCollection",
    generated_at: new Date().toISOString(),
    features,
  };
}

async function main() {
  try {
    console.log("Récupération des données Grist...");
    const csvText = await fetchGristCsv();
    const csvRows = parseCsv(csvText);
    console.log("================================");
console.log("Colonnes détectées dans Grist :");

if (csvRows.length > 0) {
  console.log(Object.keys(csvRows[0]));
}

console.log("================================");
console.log("Première ligne reçue :");
console.log(JSON.stringify(csvRows[0], null, 2));
    console.log(`${csvRows.length} lignes récupérées.`);

    console.log("Chargement du geojson local...");
    const geojson = JSON.parse(fs.readFileSync(GEOJSON_INPUT_PATH, "utf-8"));
    if (!geojson.features || !Array.isArray(geojson.features)) {
        throw new Error(
          `${GEOJSON_INPUT_PATH} n'est pas une FeatureCollection valide`
        );
      }
    console.log(`${geojson.features.length} géométries chargées.`);

    console.log("Jointure en cours...");
    const joined = buildJoinedGeojson(csvRows, geojson);
    console.log(`${joined.features.length} communes jointes avec succès.`);

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

// ====================================
// GEOJSON
// ====================================

fs.writeFileSync(
  OUTPUT_PATH,
  JSON.stringify(joined, null, 2),
  "utf8"
);

console.log("====================================");
console.log(`Fichier écrit : ${OUTPUT_PATH}`);
console.log(`Nombre de features : ${joined.features.length}`);

// ====================================
// LAST UPDATE
// ====================================

fs.writeFileSync(
  UPDATE_PATH,
  JSON.stringify(
    {
      updated_at: new Date().toISOString(),
      features_count: joined.features.length
    },
    null,
    2
  ),
  "utf8"
);

console.log(`Fichier écrit : ${UPDATE_PATH}`);
console.log("====================================");
  } catch (error) {
    console.error("Erreur :", error.message);
    process.exit(1);
  }
}

main();