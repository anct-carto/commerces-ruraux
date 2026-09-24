// =====================================================================
// CONFIGURATION
// =====================================================================

// En local (pendant que tu testes avec "node src/server.js") :
const GEOJSON_URL = "http://localhost:5500/commerces-ruraux-geo.json";
// Une fois déployé chez ton hébergeur, remplace la ligne ci-dessus par
// l'URL réelle de ton app Node, par exemple :
// const GEOJSON_URL = "https://tonsite.fr/api/commerces-ruraux-geo.json";

const COLORS = {
    fixe: "#616DAF",
    ambulant: "#398373"
};

// =====================================================================
// INITIALISATION CARTE
// =====================================================================
// const map = L.map("map", {
//     zoomControl: true
// }).setView([46.6, 2.2], 6);

// L.tileLayer(
//     "https://data.geopf.fr/wmts?" +
//     "SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
//     "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2" +
//     "&STYLE=normal&TILEMATRIXSET=PM" +
//     "&FORMAT=image/png" +
//     "&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
//     {
//         attribution: "&copy; IGN-F/Géoportail",
//         maxZoom: 18
//     }
// ).addTo(map);

// =========================
// CARTE
// =========================

const map = L.map("map", {
    zoomControl: true
}).setView([46.4, 2.8], 6.5);

// définition du fond de plan - ici OSM standard
L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19
    }
).addTo(map);

// définition initiale du zoom à l'ouverture de la carte
map.fitBounds([
    [41.2, -5.2], // Sud-Ouest
    [51.2, 9.2]   // Nord-Est
]);


// =====================================================================
// SIDEBAR
// =====================================================================

const sidebar = L.control.sidebar({
    container: "sidebar",
    position: "left",
    autopan: true
}).addTo(map);

// Ouverture automatique du panneau "Accueil" au chargement de la page
sidebar.open("home");

// =====================================================================
// COUCHES
// =====================================================================

const fixeLayer = L.layerGroup().addTo(map);
const ambulantLayer = L.layerGroup().addTo(map);

// =====================================================================
// CLASSIFICATION
// =====================================================================

function getCategory(properties) {

    const value =
        properties["Libelle Téléservice"] || "";

    if (
        value ===
        "Fonds de Soutien au Commerce Rural Non Sédentaire - Exploitant"
    ) {
        return "ambulant";
    }

    if (
        value ===
            "Fonds de Soutien au Commerce Rural Sédentaire - Exploitant" ||
        value ===
            "Fonds de Soutien au Commerce Rural Sédentaire - Porteur de Projet Immobilier"
    ) {
        return "fixe";
    }

    return null;
}

// =====================================================================
// SIDEBAR CONTENT
// =====================================================================
function openSidebar(properties) {

    document.getElementById("home-content").style.display = "none";

    document.getElementById("commune-card").style.display = "block";

    document.getElementById("sidebar-title").innerHTML =
        properties["Ville"] || "Commune";

    const category = getCategory(properties);

    const typeLabel =
        category === "fixe"
            ? "Fixe"
            : category === "ambulant"
                ? "Ambulant"
                : "";

    document.getElementById("sidebar-content").innerHTML = `

        <div class="card shadow-sm">

            <div class="card-body">

                <table class="table table-sm">

                    <tr>
                        <th>Commune</th>
                        <td>${properties["Ville"] || ""}</td>
                    </tr>
                
                    <tr>
                        <th>Département</th>
                        <td>${properties["Département"] || ""}</td>
                    </tr>

                    <tr>
                        <th>Région</th>
                        <td>${properties["Région"] || ""}</td>
                    </tr>

                    <tr>
                        <th>Activité</th>
                        <td>${properties["Activité principale synthétique"] || ""}</td>
                    </tr>

                    <tr>
                        <th>Type</th>
                        <td>${typeLabel}</td>
                    </tr>

                </table>

            </div>

        </div>

    `;

    sidebar.open("home");
}


// ajout des parametre du bouton qui permet de réduire la page du popup
document.addEventListener("click", function(e) {

    if (e.target.id === "close-card") {

        document.getElementById("commune-card").style.display = "none";

        document.getElementById("home-content").style.display = "block";

    }

});

// =====================================================================
// CHARGEMENT GEOJSON
// =====================================================================

fetch(GEOJSON_URL)
    .then(response => response.json())
    .then(data => {

        const bounds = [];

        // =================================================================
        // FILTRE : on ne garde que les demandes "Votée"
        // =================================================================
        const filteredData = {
            ...data,
            features: data.features.filter(
                feature =>
                    feature.properties["Statut libellé - Demande"] === "Votée"
            )
        };

        L.geoJSON(filteredData, {

            pointToLayer(feature, latlng) {

                const category =
                    getCategory(feature.properties);

                let color = "#999999";

                if (category === "fixe") {
                    color = COLORS.fixe;
                }

                if (category === "ambulant") {
                    color = COLORS.ambulant;
                }

                return L.circleMarker(latlng, {
                    radius: 5,
                    fillColor: color,
                    fillOpacity: 0.9,
                    color: "#ffffff",
                    weight: 1
                });
            },

            onEachFeature(feature, layer) {

                const category =
                    getCategory(feature.properties);


                layer.on("click", () => {
                    openSidebar(feature.properties);
                });
                // SURVOL
                layer.on("mouseover", function() {

                    this.setStyle({
                        radius: 7,
                        weight: 3,
                        color: "#fffffff",
                        fillOpacity: 1
                    });

                     this.bringToFront();

                });

                // FIN SURVOL
                layer.on("mouseout", function() {

                    this.setStyle({
                        radius: 5,
                        weight: 1,
                        color: "#ffffff",
                        fillOpacity: 0.9
                    });
                });
                    
                if (category === "fixe") {
                    fixeLayer.addLayer(layer);
                }

                if (category === "ambulant") {
                    ambulantLayer.addLayer(layer);
                }

                bounds.push(layer.getLatLng());
            }

        });

        // Les points "ambulant" doivent toujours passer au-dessus des "fixe"
        ambulantLayer.eachLayer(function (layer) {
            layer.bringToFront();
        });

        if (bounds.length > 0) {
            map.fitBounds(L.latLngBounds(bounds));
        }

    })
    .catch(error => {
        console.error(error);
    });

// =====================================================================
// LEGENDE
// =====================================================================
const legend = L.control({
    position: "topright"
});

legend.onAdd = function () {

    const div = L.DomUtil.create("div", "legend");

    div.innerHTML = `
        <div style="
            background:white;
            padding:10px;
            border-radius:4px;
            box-shadow:0 0 10px rgba(0,0,0,.15);
            font-size:14px;
        ">

            <div style="margin-bottom:8px;font-weight:bold;">
                Type de commerce
            </div>

            <div style="margin-bottom:6px;">
                <label style="cursor:pointer;">
                    <input type="checkbox" id="toggle-fixe" checked>
                    <span style="
                        color:${COLORS.fixe};
                        font-size:18px;
                        margin-left:4px;
                        margin-right:4px;
                    ">●</span>
                    Fixe
                </label>
            </div>

            <div>
                <label style="cursor:pointer;">
                    <input type="checkbox" id="toggle-ambulant" checked>
                    <span style="
                        color:${COLORS.ambulant};
                        font-size:18px;
                        margin-left:4px;
                        margin-right:4px;
                    ">●</span>
                    Ambulant
                </label>
            </div>

        </div>
    `;

    L.DomEvent.disableClickPropagation(div);

    return div;
};

legend.addTo(map);

// Gestion affichage / masquage

document.addEventListener("change", function(e) {

    if (e.target.id === "toggle-fixe") {

        if (e.target.checked) {
            map.addLayer(fixeLayer);
        } else {
            map.removeLayer(fixeLayer);
        }
    }

    if (e.target.id === "toggle-ambulant") {

        if (e.target.checked) {
            map.addLayer(ambulantLayer);
        } else {
            map.removeLayer(ambulantLayer);
        }
    }

});