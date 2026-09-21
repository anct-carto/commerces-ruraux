/*
    Carte interactive des territoires en commnun et territoires d'engagement
    Hassen Chougar / service cartographie - ANCT
    MAJ Luna Pelchat - Décembre 2025
    dependances : Leaflet 1.0.8, vue 2.7, vue-router 4.0.5, bootstrap 5.1, papaparse 5.3.1
*/

// Chargement données globales ****************************************************************************

// window.dsfr = {
//     verbose: true,
//     mode: 'manual'
//   };

// source données
const dataUrl = "data/liste_tec_te.csv"
let tab = JSON.parse(sessionStorage.getItem("session_data"));
let page_status;




// charge depuis session storage ou fetch
async function getData(path) {
    const sessionData = JSON.parse(sessionStorage.getItem("session_data1"));
    if(sessionData) {
        return sessionData
    } else {
        try {
            let data = await fetchCsv(path)
            data.forEach(e => {
                if(e.ingredients) {
                    e.ingredients = e.ingredients.split(";\n")
                }
            });
            return data
        } catch (error) {
            console.error(error)
        }
    }
}

// parse csv (ou tableau issu d'un tableau partagé) en json
function fetchCsv(data_url) {
    return new Promise((resolve,reject) => {
        Papa.parse(data_url, {
            download: true,
            header: true,
            complete: (res) => resolve(res.data.filter(e => e.id_engcit != "")),
            error:(err) => reject(err)
        });
    })
}



// ****************************************************************************

// écran chargement 

class LoadingScreen {
    constructor() {
        this.state = {
            isLoading:false
        }
    }
    show() {
        this.state.isLoading = true
    }
    hide() {
        this.state.isLoading = false
    }
}

let loadingScreen = new LoadingScreen();


// écran de chargement
const Loading = {
    template: `
    <div id = "loading" class="w-100 h-100 d-flex flex-column justify-content-center align-items-center">
        <div class="row">
            <div class="spinner-border" role="status">
                <p class="sr-only">Loading...</p>
            </div>
        </div>
        <div class="row">
            <p>Chargement en cours ...</p>
        </div>
    </div>
    `
}

// ****************************************************************************


// composant "barre de recherche"
const SearchBar = {
    template: `
            <div id="search-bar-container">
                <div class="input-group">
                    <i class="la la-search input-icon"></i>
                    <input ref = "input" 
                            class="search-field form-control"
                            type="search"
                            placeholder="Rechercher un territoire ..." 
                            v-model="inputAdress"
                            @keyup="onKeypress($event)" 
                            @keydown.down="onKeyDown"
                            @keydown.up="onKeyUp"
                            @keyup.enter="onEnter">
                </div>
                <div class="autocomplete-suggestions-conainter" v-if="isOpen">
                    <ul class = "list-group">
                        <li class="list-group-item" v-for="(suggestion, i) in suggestionsList"
                            @click="onClickSuggest(suggestion)"
                            @mouseover="onMouseover(i)"
                            @mouseout="onMouseout(i)"
                            :class="{ 'is-active': i === index }">
                                {{ suggestion.libgeo }} ({{ suggestion.codgeo }})
                        </li>
                    </ul>
                </div>
            </div>`,
    data() {
        return {
            index:0,
            inputAdress:'',
            isOpen:false,
            suggestionsList:[],
        }
    },
    watch: {
        inputAdress() {
            if (!this.inputAdress) {
                this.isOpen = !this.isOpen;
                this.index = 0;
                this.suggestionsList = [];
            }
        }
    },
    async mounted() {
        document.addEventListener("click", this.handleClickOutside);
        document.addEventListener("keyup", (e) => {
            if(e.key === "Escape") {
                this.isOpen = false;
                this.index = -1;

            }
        });
        this.data = await getData(dataUrl)
    },
    destroyed() {
        document.removeEventListener("click", this.handleClickOutside);
    },
    methods: {
        onKeypress() {
            this.isOpen = true;
            let val = this.inputAdress;

            if(val === '') {
                this.isOpen = false;                
            };

            this.suggestionsList = '';

            if (val != undefined && val != '') {
                result = this.data.filter(e => {
                    return e.libgeo.toLowerCase().replace(/-/g," ").includes(val.toLowerCase())
                });
                this.suggestionsList = result.slice(0,6);
            }
        },
        onKeyUp() {
            if (this.index > 0) {
                this.index = this.index - 1;
            };
        },
        onKeyDown() {
            if (this.index < this.suggestionsList.length) {
                this.index = this.index + 1;
            }
        },
        onMouseover(e) {
            this.index = e;
        },
        onMouseout() {
            this.index = -1;
        },
        onEnter() {
            if(this.suggestionsList[this.index]) {
                this.inputAdress = this.suggestionsList[this.index].libgeo;
                
                suggestion = this.suggestionsList[this.index];
                this.$emit('searchResult',suggestion)

                this.suggestionsList = [];
                this.isOpen = !this.isOpen;
                this.index = -1;                
            }
        },
        onClickSuggest(suggestion) {            
            event.stopPropagation()
            // reset search
            this.inputAdress = suggestion.libgeo;
            
            this.suggestionsList = [];
            this.isOpen = !this.isOpen;

            this.$emit('searchResult',suggestion);
        },
        handleClickOutside(evt) {
            if (!this.$el.contains(evt.target)) {
              this.isOpen = false;
              this.index = -1;
            }
        }
    },
};

// ****************************************************************************

// composant texte d'introduction
const IntroTemplate = {
    template: `
        <div>
            <p>Cette carte interactive recense les territoires accompagnés par l'ANCT depuis 2021, pour construire l'action publique locale en coopération avec les citoyens et les acteurs du territoire. <br> 
            L’offre de services Territoires d’engagement se décline dans 4 modalités :</p>
            <p>1. la <span class="legend-btn-intro" style="background-color:#293173" @click="controlLayers('CCO')">cellule de conseil et d'orientation Territoires d'engagement </span> : une plateforme d’accompagnement à distance  accessible à tous les élus et les agents des collectivités, pour échanger sur les enjeux stratégies et les questions opérationnelles en matière de  participation citoyenne et de coopérations territoriales.</p>
            <p>2. les <span class="legend-btn-intro" style="background-color:#00ac8c" @click="controlLayers('PATDE')">les parcours d'accompagnement Territoires d'engagement </span> : des parcours de 12 à 15 mois, adaptés à chaque territoire, pour expérimenter des démarches participatives, former les élus, accompagner les services et faire émerger dans le territoire  territoire une culture durable de l’engagement citoyen.</p>           
            <p>3. les <span class="legend-btn-intro" style="background-color:#f69000" @click="controlLayers('PPTDE')">les projets partagés Territoires d'engagement </span> : une démarche d’ingénierie collective pour concevoir un projet de politique publique, en lien avec d’autres collectivités, en misant sur la coopération et l’engagement citoyen.  </p>
            <p>4.les <span class="legend-btn-intro" style="background-color:#ec6555" @click="controlLayers('AI')">ateliers interactifs de l’ANCT</span> : des cycles d’ateliers d’intelligence collective à distance, animés par des experts de la coopération territoriale, pour croiser les regards et les expériences autour des grands défis qui font l’actualité des collectivités.</p>
  
            <br><a id="back-btn" type="button" class="btn btn-primary" href="https://anct.gouv.fr/programmes-dispositifs/territoires-d-engagement" target="_blank">
                <i class="las la-external-link-alt"></i>
                En savoir plus
            </a>
        </div>`,
        methods: {
            controlLayers(dispositif) {
                this.$emit('controlLayers',dispositif)
            }
        },
};

// ****************************************************************************

// composant style texte fiche 
const CardInfoTemplate = {
    template:`
        <p v-if="element">
            <span class="subtitle">{{ subtitle }}</span><br>
            <span class="element">{{ element }}</span>
        </p>
    `,
    props: ['subtitle', 'element'],
};

// obs = observation
// composant fiche 
const CardTemplate = {
    template:`
        <div class="card">
            <div class= "card-header" :style="'background-color:'+obs.color">
                <span>{{ obs.libgeo }} ({{ obs.codgeo }})</span>
            </div>
            <div class= "card-body">
                <info subtitle="Démarche engagée" :element="dispositif"></info>
                <info subtitle="Période d'accompagement" :element="obs.periode" v-if="obs.dispositif != 'CCO'"></info>
                <info subtitle="Projets partagés" :element="obs.projet_partage" v-if="obs.dispositif == 'PPTDE'"></info>
                <div v-if="obs.dispositif == 'PATDE' & obs.ingredients.length>0">
                    <span class="subtitle">Ingrédients</span><br>
                    <ul>
                        <li v-for="ingredient in obs.ingredients" class="element">
                            <i class="las la-arrow-right"></i> {{ ingredient }}
                        </li>
                    </ul><br>
                </div>
                <a class="link" :href="obs.url" target="_blank" v-if="obs.dispositif != 'CCO'">
                    <i class="las la-external-link-alt"></i>
                    Voir la fiche projet
                </a>
            </div>
        </div>`,
    props: ['obs'],
    components: {
        'info':CardInfoTemplate,
    },
    computed: {
        dispositif() {
            let dispositif;
            switch (this.obs.dispositif) {
                case "PPTDE":
                    dispositif = "les projets partagés Territoires d'engagement"
                    break;  
                case "PATDE":
                    dispositif = "les parcours d'accompagnement Territoires d'engagement"
                    break;  
                case "CCO":
                    dispositif = "Territoires d'engagement : la cellule de conseil et d'orientation"
                    break;
                case "AI":
                    dispositif = "Territoires d'engagement : les ateliers interactifs"
                    break; 
            };
            return dispositif
        }
    }
};

// ****************************************************************************


// composant sidebar
const LeafletSidebar = {
    template: ` 
    <div id="sidebar" class="leaflet-sidebar collapsed">
        <!-- nav tabs -->
        <div class="leaflet-sidebar-tabs">
            <!-- top aligned tabs -->
            <ul role="tablist">
                <li>
                    <a href="#home" role="tab" title="Accueil">
                        <i class="las la-home"></i>
                        <span class="tab-name">Accueil</span>
                    </a>
                </li>
                <li>
                    <a href="#a-propos" role="tab" title="À propos">
                        <i class="las la-info-circle"></i>
                        <span class="tab-name">À propos</span>
                    </a>
                </li>
            </ul>
            <!--<div class="tab-name" v-if="showTabName">
                <span>{{ tabName }}</span>
            </div>-->
        </div>
        <!-- panel content -->
        <div class="leaflet-sidebar-content">
            <div class="leaflet-sidebar-header">
                <span style="color:gray">
                    Carte interactive des
                </span>
                <h4>
                    <br>territoires d'engagement
                </h4>
                <span class="leaflet-sidebar-close" @click="$emit('closeSidebar')">
                    <i class="la la-step-backward"></i>
                </span>
            </div>
            <div class="leaflet-sidebar-pane" id="home">
                <div v-if="!show" class="sidebar-body">
                    <search-group @searchResult="getResult"></search-group>
                    <text-intro @controlLayers="emitLayerId"></text-intro>
                </div>
                <div>
                    <card :obs="cardContent" v-if="show"></card><br>
                    <button id="back-btn" type="button" class="btn btn-primary" v-if="show" @click="onClick">
                        <i class="la la-arrow-left"></i>
                        Retour
                    </button>
                </div>
            </div>
            <div class="leaflet-sidebar-pane" id="a-propos">
                <a href="https://agence-cohesion-territoires.gouv.fr/" target="_blank">
                    <img src="img/LOGO-ANCT+Marianne.png" width="100%" style = 'padding-bottom: 5%;'>
                </a>
                <p>
                    <b>Source et administration des données :</b>
                    ANCT
                </p>
                <p>
                    <b>Réalisation  et maintenance de l'outil :</b>
                    Pôle ADT - ANCT - <a href = 'https://cartotheque.anct.gouv.fr/cartes' target="_blank">Équipe cartographie</a>
                </p>
                <p>Technologies utilisées : Leaflet, Bootstrap, Vue.js 2.7</p>
                <p>Le code source de cet outil est consultable sur <a href="https://www.github.com/anct-carto/engagement-citoyen" target="_blank">Github</a>.</p>
            </div>
        </div>
    </div>`,
    components: {
        'search-group':SearchBar,
        card: CardTemplate,
        'text-intro':IntroTemplate
    },
    props: ['sourceData'],
    data() {
        return {
            show:false,
            cardContent:null,
            showTabName:false,
            tabName:'',
        }
    },
    computed: {
        // filteredList() {
        //     return this.sourceData.slice(0, this.nbResults)
        // },
    },
    watch: {
        sourceData() {
            this.cardContent = this.sourceData;
            this.cardContent ? this.show = true : this.show = false
        },
    },
    methods: {
        onClick() {
            this.cardContent = '';
            this.show = !this.show;

            this.$emit("clearMap", true) // tell parent to remove clicked marker layer
            
            event.stopPropagation()
        },
        getResult(result) {
            this.$emit('searchResult', result)
        },
        emitLayerId(dispositif) {
            this.$emit("controlLayers",dispositif)
        }
    },
};



// ****************************************************************************

// composant carte avec interactions associées

const LeafletMap = {
    template: `
        <div>
            <sidebar 
                ref="sidebar" 
                :sourceData="cardContent" 
                @clearMap="clearMap()" 
                @controlLayers="controlLayers"
                @searchResult="onSearchResultReception"
                @closeSidebar="sidebar.close()">
            </sidebar>
            <div id="mapid"></div>
    </div>`,
    components: {
        'sidebar':LeafletSidebar,
    },
    data() {
        return {
            config:{
                map:{
                    container:'mapid',
                    tileLayer:'',
                    attribution:"<a href = 'https://cartotheque.anct.gouv.fr/' target = '_blank'>ANCT</a>",
                    zoomPosition:'topright',
                    scalePosition:'bottomright',
                    initialView:{
                        zoomControl:false,
                        zoom: 6,
                        center: [46.413220, 1.219482],
                        zoomSnap: 0.05,
                        minZoom:4.55,
                        maxZoom:18,
                        preferCanvas:true,
                    }
                },
                sidebar:{
                    container: "sidebar",
                    autopan: true,
                    closeButton: true,
                    position: "left",
                },
            },
            styles:{
                basemap:{
                    dep:{
                        interactive:false,
                        style: {
                            fillColor:"#e8ded2",
                            fillOpacity:1,
                            color:"white",
                            weight:0.5,
                            opacity:1,
                        },
                    },
                    reg:{
                        interactive:false,
                        style: {
                            fillOpacity:0,
                            weight:1.25,
                            color:'white'
                        },
                    },
                    drom:{
                        interactive:false,
                        style: {
                            fillOpacity:0,
                            weight:0.5,
                            color:'#293173'
                        },
                    }
                },
                categories:{
                    colors:['#039d7b','#f69000','#293173', '#ec6555'],
                    values:['PATDE','PPTDE','CCO', 'AI'],
                    labels:[],
                },
                features:{
                    default:{
                        radius:6,
                        fill:true,
                        fillOpacity:1,
                        color:"white",
                        weight:1,
                    },
                    clicked:{
                        radius:10,
                        fillOpacity:1,
                        color:"white",
                        opacity:0.75,
                        weight:7,
                    },
                },
                tooltip:{
                    default:{
                        direction:"top",
                        sticky:true,
                        className:'leaflet-tooltip',
                        opacity:1,
                        offset:[0,-15],
                        permanent:false
                    },
                    clicked:{
                        direction:"top",
                        className:'leaflet-tooltip-clicked',
                    },
                }
            },
            cardContent:null,
        }
    },
    computed: {
        map() {
            const map = L.map(this.config.map.container, this.config.map.initialView);
            map.attributionControl.addAttribution(this.config.map.attribution);            
            // zoom control, scale bar, fullscreen 
            L.control.zoom({position: this.config.map.zoomPosition}).addTo(map);
            L.control.scale({ position: this.config.map.scalePosition, imperial:false }).addTo(map);
            L.control.fullscreen({
                position:'topright',
                forcePseudoFullScreen:true,
                title:'Afficher la carte en plein écran'
            }).addTo(map);
            // au clic, efface la recherche
            map.on("click",() => {
                event.stopPropagation();
                this.clearMap();
            })
            return map;
        },
        sidebar() {
            const sidebar = window.L.control.sidebar(this.config.sidebar).addTo(this.map);
            // prevent drag over the sidebar and the legend
            preventDrag(sidebar, this.map);
            return sidebar
        },
        // calques : habillage, marqueurs, étiquettes, marqueur sélectionné
        baseMapLayer() {
            return L.layerGroup({className: 'basemap-layer',interactive:false}).addTo(this.map)
        },
        pinLayer() {
            return L.layerGroup({ className: 'pin-layer' }).addTo(this.map);
        },
        pptdeLayer() {
            return L.layerGroup({ className: 'points'}).addTo(this.map)
        },
        patdeLayer() {
            return L.layerGroup({ className: 'points'}).addTo(this.map)
        },
        ccoLayer() {
            return L.layerGroup({ className: 'points'}).addTo(this.map)
        },
        aiLayer() {
            return L.layerGroup({ className: 'points'}).addTo(this.map)
        },
        labelLayer() {
            return L.layerGroup({ className: 'label-layer' }).addTo(this.map);
        },
    },
    // watch:{
    //     enableLayer() {
            
    //     }
    // },
    async mounted() {
        loadingScreen.show() // pendant le chargement, active le chargement d'écran
        await this.createBasemap(); // créé les géométries d'habillage !!! ne fonctionne pas avec les tuiles vectorielles !!!!
        this.displayToponym(); // affiche les toponymes d'habillage

        // ///////////////////////////////////

        // 1. joint les données attributaires aux géométries ...
        this.data = await getData(dataUrl);
        this.comGeom = await this.loadGeom("data/geom_ctr.geojson");
        this.joinedData = this.joinGeom(this.data,this.comGeom)
        // ... 2. créée la couche sur leaflet ...
        this.createFeatures(this.joinedData)

        // ///////////////////////////////////
        
        // création fenêtre de contrôle des couches
        L.control.layers(null,{
            "Territoires en commun :<br>les projets partagés":this.pptdeLayer,
            "Territoires d'engagement :<br>les parcours":this.patdeLayer,
            "Territoires d'engagement :<br>la cellule de conseil et d'orientation":this.ccoLayer,
            "Territoires d'engagement :<br>les ateliers interactifs":this.aiLayer,

            "Toponymes":this.labelLayer
        },{
            collapsed:true,
            position:"topright"
        }).addTo(this.map);

        // ///////////////////////////////////

        loadingScreen.hide() // enlève le chargement d'écran
    },
    methods: {
        async loadGeom(file) {
            const res = await fetch(file);
            const data = await res.json()
            return data
        },
        // créer le fond de carte (limite dép/reg/ ce que tu veux bref)
        async createBasemap() {
            const depGeom = await this.loadGeom("data/geom_dep.geojson")
            const regGeom = await this.loadGeom("data/geom_reg.geojson")
            const sepDromGeom = await this.loadGeom("data/cercles_drom.geojson")

            new L.GeoJSON(depGeom, this.styles.basemap.dep).addTo(this.baseMapLayer);
            new L.GeoJSON(regGeom, this.styles.basemap.reg).addTo(this.baseMapLayer);
            new L.GeoJSON(sepDromGeom,this.styles.basemap.drom).addTo(this.baseMapLayer);

            this.map.fitBounds(new L.GeoJSON(regGeom).getBounds())
        },
        displayToponym() {
            this.loadGeom("data/labels.geojson").then(labelGeom => {
                // déclaration des objets "map" et "layer" comme constantes obligatoire sinon inconnu dans le zoomend avec "this"
                const map = this.map;
                const labelLayer = this.labelLayer;
                
                LToponym(labelGeom,"région").addTo(labelLayer);
                const labelDep = LToponym(labelGeom,"département");
                const labelCan = LToponym(labelGeom,"canton");

                // ajout/suppression étiquettes reg ou dep en fonction du zoom
                map.on('zoomend', function() {
                    let zoom = map.getZoom();
                    switch (true) {
                      case zoom <= 7 :
                        [labelDep,labelCan].forEach(layer => layer.removeFrom(labelLayer))
                        break;
                      case zoom > 7 && zoom <=9:
                        labelDep.addTo(labelLayer);
                        labelCan.removeFrom(labelLayer);
                        break;
                      case zoom > 9 :
                        labelCan.addTo(labelLayer);
                        break;
                    }
                });
            })
        },
        // jointure entre attributs et géométries
        joinGeom(attributs,geometries) {
            let arr2Map = attributs.reduce((acc, curr) => {
                acc[curr.codgeo] = {properties:curr}
                return acc;
            }, {});
            let combined = geometries.features.map(d => Object.assign(d, arr2Map[d.properties.codgeo]));
            combined = combined.filter(e => this.data.map(e=>e.codgeo).includes(e.properties.codgeo))
            return combined
        },
        createFeatures(dataGeom) {
            combined = dataGeom;

            const styleDefault = this.styles.features.default;
            const styleTooltipDefault = this.styles.tooltip.default;
            const getColor = (e) => this.getColor(e);
            const stylishTooltip = (feature) => this.stylishTooltip(feature)

            for(let i=0;i<combined.length;i++) {
                let marker = new L.GeoJSON(combined[i], {
                    filter:(feature) => this.data.map(e=>e.codgeo).includes(feature.properties.codgeo),
                    pointToLayer: function (feature, latlng) {
                        let circleMarker = L.circleMarker(latlng, styleDefault);
                        circleMarker.setStyle({fillColor:getColor(feature.properties.dispositif)});
                        // circleMarker.bindTooltip(stylishTooltip(feature.properties),styleTooltipDefault);
                        return circleMarker
                    },
                }).on("mouseover", (e) => {
                    e.target.setStyle(this.styles.features.clicked)
                }).on("mouseout",(e) => {
                    e.target.setStyle(styleDefault)
                })
                // zone tampon invisible autour du marqueur pour le sélectionner facilement
                let circleAnchor = new L.GeoJSON(combined[i], {
                    filter:(feature) => this.data.map(e=>e.codgeo).includes(feature.properties.codgeo),
                    pointToLayer: function (feature, latlng) {
                        let circleMarker = L.circleMarker(latlng, {
                            radius:20,
                            fillOpacity:0,
                            opacity:0,
                        });
                        circleMarker.bindTooltip(stylishTooltip(feature.properties),styleTooltipDefault);
                        return circleMarker
                    }
                }).on("click", (e) => {
                    L.DomEvent.stopPropagation(e);
                    this.onClick(e.sourceTarget.feature.properties.codgeo)
                }).on("mouseover", (e) => {
                    e.target.setStyle(this.styles.features.clicked)
                    e.target.setStyle({fillColor:getColor(e.sourceTarget.feature.properties.dispositif)})
                }).on("mouseout",(e) => {
                    e.target.setStyle({
                            radius:20,
                            fillOpacity:0,
                            opacity:0,
                        })
                });

                // ajout au calque correspondant
                switch (combined[i].properties.dispositif) {
                    case "PPTDE":
                        marker.addTo(this.pptdeLayer);                        
                        circleAnchor.addTo(this.pptdeLayer);                        
                        break;
                    case "PATDE":
                        marker.addTo(this.patdeLayer);
                        circleAnchor.addTo(this.patdeLayer);
                        break;
                    case "CCO":
                        marker.addTo(this.ccoLayer);                        
                        circleAnchor.addTo(this.ccoLayer);                        
                        break;
                    case "AI":
                        marker.addTo(this.aiLayer);                        
                        circleAnchor.addTo(this.aiLayer);                        
                        break;
                }
                setTimeout(() => {
                    // this.sidebar.open('home');
                    this.sidebar.close();
                }, 100);
            }
        },
        onClick(code) {
            // vide la couche si pleine
            this.pinLayer.clearLayers();
            
            // // envoie les infos de l'élément sélectionné au composant "fiche"
            let content = this.data.find(e => e.codgeo == code);
            content.color = this.getColor(content.dispositif)
            this.cardContent = content;

            // retrouve la géométrie
            let coordsResult = this.comGeom.features.find(e => e.properties.codgeo == code).geometry.coordinates.reverse();

            // style à appliquer
            let glow = new L.circleMarker(coordsResult,this.styles.features.clicked).addTo(this.pinLayer);
            let circle = new L.circleMarker(coordsResult,this.styles.features.default).addTo(this.pinLayer);
            circle.setStyle({fillColor:this.getColor(content.dispositif)});
            glow.setStyle({fillColor:this.getColor(content.dispositif)});

            this.sidebar.open("home");
        },
        stylishTooltip(marker) {
            return `<span style="background-color:${this.getColor(marker.dispositif)}">${marker.libgeo}</span>`
        },
        onSearchResultReception(result) {
            // simule un click sur le code de cette entité pour renvoyer la fiche correspondante
            this.onClick(result.codgeo);
        },
        clearMap() {
            this.cardContent = null;
            this.pinLayer.clearLayers();
        },
        flyToBoundsWithOffset(layer) {
            // cette fonction est utile pour faire décaler le centre de la carte sur le côté droit si le panneau est ouvert
            let offset = document.querySelector('.leaflet-sidebar-content').getBoundingClientRect().width;
            this.map.flyToBounds(layer, { paddingTopLeft: [offset, 0] });
        },
        getColor(type) {
            // cette fonction est utile pour récupérer la bonne couleur de chaque modalité préalablement déterminée
            let color;
            this.styles.categories.values.forEach((v,i) => {
                if(v === type) color = this.styles.categories.colors[i]
            })
            return color
        },
        controlLayers(dispositif) {
            switch (dispositif) {
                case "PPTDE":
                    [this.pptdeLayer,this.patdeLayer,this.ccoLayer, this.aiLayer].forEach(layer => layer.removeFrom(this.map));
                    this.pptdeLayer.addTo(this.map);
                    break;
                case "PATDE":
                    [this.pptdeLayer,this.patdeLayer,this.ccoLayer, this.aiLayer].forEach(layer => layer.removeFrom(this.map));
                    this.patdeLayer.addTo(this.map);
                    break;
                case "CCO":
                    [this.pptdeLayer,this.patdeLayer,this.ccoLayer, this.aiLayer].forEach(layer => layer.removeFrom(this.map));
                    this.ccoLayer.addTo(this.map);                    
                    break;
                case "AI":
                    [this.pptdeLayer,this.patdeLayer,this.ccoLayer, this.aiLayer].forEach(layer => layer.removeFrom(this.map));
                    this.aiLayer.addTo(this.map);                    
                    break;
            }
        }
    },
}



// ****************************************************************************
// ****************************************************************************

const App = {
    template: 
        `<div>
            <loading id="loading" v-if="state.isLoading"></loading>
            <leaflet-map ref="map"></leaflet-map>
        </div>
    `,
    components: {
        'leaflet-map': LeafletMap,
        'loading':Loading,
    },
    data() {
        return {
            state:loadingScreen.state 
        }
    }
}

// instance vue
new Vue({
    el: '#app',
    components: {
        'app': App,
    },
});


// ****************************************************************************
// ****************************************************************************


// Fonctions universelles (utiles dans tous les projets)

// empêcher déplacement de la carte en maintenant/glissant le pointeur de souris sur sidebar
function preventDrag(div, map) {
    // Disable dragging when user's cursor enters the element
    div.getContainer().addEventListener('mouseover', function () {
        map.dragging.disable();
    });

    // Re-enable dragging when user's cursor leaves the element
    div.getContainer().addEventListener('mouseout', function () {
        map.dragging.enable();
    });
};

// création d'étiquette de repères (chef lieux par ex) 
function LToponym(sourceData,statut) {
    return new L.GeoJSON(sourceData, {
        pointToLayer: (feature,latlng) => L.marker(latlng, {
            icon:createLabelIcon("labelClass", feature.properties.libgeom),
            interactive: false,
            className:"regLabels"
        }),
        filter:(feature) => feature.properties.STATUT == statut,
        className:"labels",
        rendererFactory: L.canvas()
      })
}

function createLabelIcon(labelClass,labelText) {
    return L.divIcon({
        className: svgText(labelClass),
        html: svgText(labelText)
    })
}

function svgText(txt) {
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><text x="0" y = "10">'
        + txt + '</text></svg>';
}