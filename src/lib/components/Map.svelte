<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import maplibregl from "maplibre-gl";
    import {
        theme,
        filteredOutlets,
        outlets,
        brands,
        selectedBrands,
        mapStyle,
        userLocation,
        isNavigating,
        navigationTarget,
        routeCoordinates,
        selectedOutlet,
        mapAction,
        type MapStyleType,
    } from "$lib/stores";
    import { getLogoUrl } from "$lib/pocketbase";
    import type { Outlet } from "$lib/pocketbase";
    import { env as publicEnv } from "$env/dynamic/public";

    let mapContainer: HTMLDivElement;
    let map: maplibregl.Map;
    let markers: maplibregl.Marker[] = [];
    let currentPopup: maplibregl.Popup | null = null;
    let userMarker: maplibregl.Marker | null = null;
    let isLegendCollapsed = false;
    let isMapStylePanelOpen = false;
    let isLocating = false;
    let routeLayer: string | null = null;
    let clusterSourceAdded = false;
    let clusterHandlersAdded = false;

    // Brand logo cache for performance
    const brandLogoCache = new Map<string, string>();

    const mapTilerKey = publicEnv.PUBLIC_MAPTILER_KEY;

    // Map styles configuration
    const mapStyles = {
        default: {
            dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
            light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        },
        satellite: mapTilerKey
            ? `https://api.maptiler.com/maps/hybrid/style.json?key=${mapTilerKey}`
            : "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
        terrain: mapTilerKey
            ? `https://api.maptiler.com/maps/outdoor/style.json?key=${mapTilerKey}`
            : "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
        "3d": mapTilerKey
            ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapTilerKey}`
            : "https://demotiles.maplibre.org/style.json",
    };

    // Free satellite tiles from Esri
    const satelliteStyle = {
        version: 8,
        sources: {
            satellite: {
                type: "raster",
                tiles: [
                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                ],
                tileSize: 256,
                attribution: "© Esri",
            },
        },
        layers: [
            {
                id: "satellite-layer",
                type: "raster",
                source: "satellite",
                minzoom: 0,
                maxzoom: 22,
            },
        ],
    };

    // Terrain style with hillshading
    const terrainStyle = {
        version: 8,
        sources: {
            terrain: {
                type: "raster",
                tiles: [
                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
                ],
                tileSize: 256,
                attribution: "© Esri",
            },
        },
        layers: [
            {
                id: "terrain-layer",
                type: "raster",
                source: "terrain",
                minzoom: 0,
                maxzoom: 22,
            },
        ],
    };

    onMount(() => {
        map = new maplibregl.Map({
            container: mapContainer,
            style: mapStyles.default[$theme],
            center: [118.0, -2.5],
            zoom: 5,
            minZoom: 4,
            maxZoom: 20,
            attributionControl: false,
            pitch: 0,
            bearing: 0,
            maxPitch: 85,
        });

        const geolocate = new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showUserHeading: true,
        } as any);

        geolocate.on("geolocate", (e: any) => {
            userLocation.set({
                lat: e.coords.latitude,
                lng: e.coords.longitude,
            });
            isLocating = false;
        });

        geolocate.on("error", () => {
            isLocating = false;
            alert(
                "Tidak dapat mengakses lokasi Anda. Pastikan izin lokasi diaktifkan.",
            );
        });

        map.addControl(geolocate, "bottom-right");

        map.on("load", () => {
            updateMarkers($filteredOutlets);
            // Request location on load
            setTimeout(() => geolocate.trigger(), 1000);
        });
    });

    onDestroy(() => {
        if (map) map.remove();
    });

    // Reactive statement for marker updates
    $: if (map && $filteredOutlets) {
        if (map.isStyleLoaded()) {
            updateMarkers($filteredOutlets);
        } else {
            map.once("styledata", () => updateMarkers($filteredOutlets));
        }
    }

    // Theme change handler
    $: if (map && $theme && $mapStyle === "default") {
        const style = mapStyles.default[$theme];
        map.setStyle(style);
        map.once("styledata", () => {
            updateMarkers($filteredOutlets);
            if ($routeCoordinates.length > 0) drawRoute($routeCoordinates);
        });
    }

    // Map style change handler
    $: if (map && $mapStyle) {
        changeMapStyle($mapStyle);
    }

    $: if (map && $routeCoordinates.length > 0) {
        if (map.isStyleLoaded()) {
            drawRoute($routeCoordinates);
        } else {
            map.once("styledata", () => drawRoute($routeCoordinates));
        }
    }

    let lastNavTargetId: string | null = null;
    $: if (map && $isNavigating && $navigationTarget) {
        if (!$userLocation) {
            // Try to ask for location if not available yet
            // The built-in GeolocateControl will prompt; we can also call locateUser
            locateUser();
        }
        if (lastNavTargetId !== $navigationTarget.id) {
            navigateToOutlet($navigationTarget);
            lastNavTargetId = $navigationTarget.id;
        }
    }

    $: if (map && $mapAction) {
        const action = $mapAction;
        if (action.type === "reset_view") {
            resetView();
            mapAction.set(null);
        } else if (action.type === "fit_bounds") {
            fitToOutlets($filteredOutlets);
            mapAction.set(null);
        } else if (action.type === "highlight_city") {
            const city = action.city.toLowerCase();
            const matches = $outlets.filter(
                (o) => o.city && o.city.toLowerCase().includes(city),
            );
            fitToOutlets(matches);
            mapAction.set(null);
        } else if (
            action.type === "focus_outlet" ||
            action.type === "open_outlet_detail"
        ) {
            const outlet = $outlets.find((o) => o.id === action.outletId);
            if (outlet) {
                focusOutlet(outlet);
                selectedOutlet.set(outlet);
            }
            mapAction.set(null);
        } else if (action.type === "navigate_to_outlet") {
            const outlet = $outlets.find((o) => o.id === action.outletId);
            if (outlet) {
                selectedOutlet.set(outlet);
                navigateToOutlet(outlet);
            }
            mapAction.set(null);
        }
    }

    function changeMapStyle(style: MapStyleType) {
        if (!map) return;

        let newStyle: any;
        switch (style) {
            case "satellite":
                newStyle = satelliteStyle;
                break;
            case "terrain":
                newStyle = terrainStyle;
                break;
            case "3d":
                newStyle = mapStyles["3d"];
                break;
            default:
                newStyle = mapStyles.default[$theme];
        }

        map.setStyle(newStyle);
        map.once("style.load", () => {
            if (style === "3d") {
                map.setMaxPitch(85);
                map.setMaxZoom(20);
                map.easeTo({ pitch: 75, bearing: -20, duration: 1000 });
            } else {
                map.setMaxPitch(60);
                map.setMaxZoom(18);
                map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
            }
            updateMarkers($filteredOutlets);
            if ($routeCoordinates.length > 0) drawRoute($routeCoordinates);

            // Add 3D buildings for 3D style
            if (style === "3d") {
                ensureOpenMapTilesSource();
                add3DBuildings();
                addRoadLayers();
            }
        });
    }

    function ensureOpenMapTilesSource() {
        if (map.getSource("openmaptiles")) return;
        const key = publicEnv.PUBLIC_MAPTILER_KEY;
        const url = key
            ? `https://api.maptiler.com/tiles/v3/tiles.json?key=${key}`
            : "https://demotiles.maplibre.org/tiles/tiles.json";
        map.addSource("openmaptiles", {
            type: "vector",
            url,
        } as any);
    }

    function add3DBuildings() {
        if (!map.getSource("openmaptiles")) return;

        // Add 3D building layer
        if (!map.getLayer("3d-buildings")) {
            const heightExpr: any = [
                "coalesce",
                ["get", "height"],
                ["get", "render_height"],
                ["*", ["coalesce", ["get", "levels"], ["get", "building:levels"], 0], 3.5],
                10,
            ];
            const baseExpr: any = [
                "coalesce",
                ["get", "min_height"],
                ["get", "render_min_height"],
                0,
            ];
            map.addLayer({
                id: "3d-buildings",
                source: "openmaptiles",
                "source-layer": "building",
                type: "fill-extrusion",
                minzoom: 14,
                paint: {
                    "fill-extrusion-color": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        14,
                        "#b0b7c3",
                        17,
                        "#9aa6b2",
                    ],
                    "fill-extrusion-height": heightExpr,
                    "fill-extrusion-base": baseExpr,
                    "fill-extrusion-opacity": 0.6,
                },
            });
        }
    }

    function addRoadLayers() {
        if (!map.getSource("openmaptiles")) return;
        if (map.getLayer("road-fill")) return;

        const baseWidth: any = [
            "match",
            ["get", "class"],
            "motorway",
            4,
            "trunk",
            3.5,
            "primary",
            3,
            "secondary",
            2.5,
            "tertiary",
            2,
            "street",
            1.8,
            "residential",
            1.6,
            1.2,
        ];

        const roadFilter: any = [
            "all",
            ["==", ["geometry-type"], "LineString"],
            [
                "match",
                ["get", "class"],
                [
                    "motorway",
                    "trunk",
                    "primary",
                    "secondary",
                    "tertiary",
                    "street",
                    "residential",
                ],
                true,
                false,
            ],
        ];

        map.addLayer({
            id: "road-casing",
            type: "line",
            source: "openmaptiles",
            "source-layer": "transportation",
            filter: roadFilter,
            paint: {
                "line-color": "#1f2937",
                "line-opacity": 0.35,
                "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    12,
                    ["*", baseWidth, 0.6],
                    16,
                    ["*", baseWidth, 1.2],
                    18,
                    ["*", baseWidth, 1.8],
                ],
                "line-blur": 0.2,
            },
        } as any);

        const roadColor: any = [
            "match",
            ["get", "class"],
            "motorway",
            "#ff7f50",
            "trunk",
            "#f4a261",
            "primary",
            "#ffd166",
            "secondary",
            "#06b6d4",
            "tertiary",
            "#00c2a8",
            "street",
            "#b0bec5",
            "residential",
            "#b0bec5",
            "#b0b7c3",
        ];

        map.addLayer({
            id: "road-fill",
            type: "line",
            source: "openmaptiles",
            "source-layer": "transportation",
            filter: roadFilter,
            paint: {
                "line-color": roadColor,
                "line-opacity": 0.92,
                "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    12,
                    ["*", baseWidth, 0.5],
                    16,
                    ["*", baseWidth, 1.0],
                    18,
                    ["*", baseWidth, 1.6],
                ],
            },
        } as any);

        // Road names
        map.addLayer({
            id: "road-labels",
            type: "symbol",
            source: "openmaptiles",
            "source-layer": "transportation_name",
            layout: {
                "symbol-placement": "line",
                "text-field": ["coalesce", ["get", "name"], ["get", "name_en"]],
                "text-font": ["Open Sans Regular"],
                "text-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    12,
                    10,
                    16,
                    12,
                    18,
                    14,
                ],
                "text-offset": [0, 0.1],
            },
            paint: {
                "text-color": "#334155",
                "text-halo-color": "#ffffff",
                "text-halo-width": 1.2,
                "text-halo-blur": 0.4,
            },
        } as any);
    }

    function updateMarkers(outlets: Outlet[]) {
        // Clear old markers
        markers.forEach((m) => m.remove());
        markers = [];
        // Clear unclustered markers from cluster mode
        unclusteredMarkers.forEach((m) => m.remove());
        unclusteredMarkers = [];

        // For large datasets, use clustering via GeoJSON source
        if (outlets.length > 100) {
            updateMarkersWithClustering(outlets);
            return;
        }

        // For smaller datasets, use individual markers
        updateMarkersIndividual(outlets);
    }

    function focusOutlet(outlet: Outlet) {
        const sidebar = document.getElementById("sidebar");
        if (sidebar && sidebar.classList.contains("hidden")) {
            sidebar.classList.remove("hidden");
        }
        map.flyTo({
            center: [outlet.longitude, outlet.latitude],
            zoom: 16,
            padding: { left: 400 },
        });
    }

    function fitToOutlets(outlets: Outlet[]) {
        if (!outlets || outlets.length === 0) return;
        if (outlets.length === 1) {
            focusOutlet(outlets[0]);
            return;
        }
        const bounds = new maplibregl.LngLatBounds();
        outlets.forEach((o) => bounds.extend([o.longitude, o.latitude]));
        map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
    }

    // Track unclustered markers created in cluster mode
    let unclusteredMarkers: maplibregl.Marker[] = [];

    function updateMarkersWithClustering(outlets: Outlet[]) {
        // Create GeoJSON FeatureCollection
        const geojson: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: outlets.map((outlet) => ({
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [outlet.longitude, outlet.latitude],
                },
                properties: {
                    id: outlet.id,
                    name: outlet.name,
                    brand: outlet.brand,
                    address: outlet.address,
                    city: outlet.city,
                    region: outlet.region,
                },
            })),
        };

        // Add or update source
        if (map.getSource("outlets")) {
            (map.getSource("outlets") as maplibregl.GeoJSONSource).setData(
                geojson,
            );
        } else {
            // Add clustering source
            map.addSource("outlets", {
                type: "geojson",
                data: geojson,
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 50,
            });

            clusterSourceAdded = true;
        }

        if (!map.getLayer("clusters")) {
            map.addLayer({
                id: "clusters",
                type: "circle",
                source: "outlets",
                filter: ["has", "point_count"],
                paint: {
                    "circle-color": [
                        "step",
                        ["get", "point_count"],
                        "#8b5cf6",
                        10,
                        "#06b6d4",
                        50,
                        "#f59e0b",
                        100,
                        "#ef4444",
                    ],
                    "circle-radius": [
                        "step",
                        ["get", "point_count"],
                        18,
                        10,
                        24,
                        50,
                        32,
                        100,
                        40,
                    ],
                    "circle-stroke-width": 3,
                    "circle-stroke-color": "rgba(255,255,255,0.6)",
                    "circle-opacity": 0.85,
                },
            });

        }

        if (!map.getLayer("cluster-count")) {
            map.addLayer({
                id: "cluster-count",
                type: "symbol",
                source: "outlets",
                filter: ["has", "point_count"],
                layout: {
                    "text-field": "{point_count_abbreviated}",
                    "text-font": ["Open Sans Bold"],
                    "text-size": 12,
                },
                paint: {
                    "text-color": "#fff",
                    "text-halo-color": "rgba(0,0,0,0.3)",
                    "text-halo-width": 1,
                },
            });

        }

        if (!clusterHandlersAdded) {
            map.on("click", "clusters", async (e) => {
                const features = map.queryRenderedFeatures(e.point, {
                    layers: ["clusters"],
                });
                const clusterId = features[0].properties.cluster_id;
                const source = map.getSource(
                    "outlets",
                ) as maplibregl.GeoJSONSource;

                const zoom = await source.getClusterExpansionZoom(clusterId);
                map.easeTo({
                    center: (features[0].geometry as GeoJSON.Point)
                        .coordinates as [number, number],
                    zoom: zoom,
                });
            });

            map.on("mouseenter", "clusters", () => {
                map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", "clusters", () => {
                map.getCanvas().style.cursor = "";
            });
            clusterHandlersAdded = true;
        }

        // Use 'render' event to show brand logo markers for unclustered points
        const renderUnclusteredMarkers = () => {
            if (!map.getSource("outlets")) return;

            // Remove old unclustered markers
            unclusteredMarkers.forEach((m) => m.remove());
            unclusteredMarkers = [];

            // Query unclustered point features currently visible
            const features = map.querySourceFeatures("outlets", {
                filter: ["!", ["has", "point_count"]],
            });

            // Deduplicate by id (querySourceFeatures can return duplicates)
            const seen = new Set<string>();
            for (const feature of features) {
                const props = feature.properties;
                if (!props || seen.has(props.id)) continue;
                seen.add(props.id);

                const coords = (feature.geometry as GeoJSON.Point)
                    .coordinates as [number, number];
                const brand = $brands.find((b) => b.id === props.brand);
                const brandName = brand?.name || "Unknown";

                let logoUrl = brandLogoCache.get(props.brand);
                if (logoUrl === undefined && brand) {
                    logoUrl = getLogoUrl("brands", brand.id, brand.logo);
                    brandLogoCache.set(props.brand, logoUrl);
                }

                const el = document.createElement("div");
                el.className = "custom-marker-wrapper";
                el.style.cursor = "pointer";

                if (logoUrl) {
                    el.innerHTML = `
                        <div style="width:36px;height:36px;background:white;border-radius:50%;border:2px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;overflow:hidden;transition:transform 0.2s;">
                            <img src="${logoUrl}" alt="${brandName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />
                        </div>
                    `;
                } else {
                    el.innerHTML = `<div class="custom-marker" style="background:#8b5cf6;"><i class="fas fa-store"></i></div>`;
                }

                el.addEventListener("mouseenter", () => {
                    const inner = el.firstElementChild as HTMLElement;
                    if (inner) inner.style.transform = "scale(1.25)";
                });
                el.addEventListener("mouseleave", () => {
                    const inner = el.firstElementChild as HTMLElement;
                    if (inner) inner.style.transform = "scale(1)";
                });

                el.addEventListener("click", (evt) => {
                    evt.stopPropagation();
                    const outlet = outlets.find((o) => o.id === props.id);
                    if (outlet) {
                        selectedOutlet.set(outlet);
                        const sidebar = document.getElementById("sidebar");
                        if (sidebar && sidebar.classList.contains("hidden")) {
                            sidebar.classList.remove("hidden");
                        }
                        map.flyTo({
                            center: coords,
                            zoom: 16,
                            padding: { left: 400 },
                        });
                    }
                });

                const marker = new maplibregl.Marker({ element: el })
                    .setLngLat(coords)
                    .addTo(map);

                unclusteredMarkers.push(marker);
            }
        };

        // Remove previous listener if any
        map.off("render", renderUnclusteredMarkers);
        // Debounced render to avoid too many updates
        let renderTimer: ReturnType<typeof setTimeout> | null = null;
        const debouncedRender = () => {
            if (renderTimer) clearTimeout(renderTimer);
            renderTimer = setTimeout(renderUnclusteredMarkers, 100);
        };
        map.on("moveend", debouncedRender);
        map.on("zoomend", debouncedRender);
        // Also run once immediately
        renderUnclusteredMarkers();
    }

    function updateMarkersIndividual(outlets: Outlet[]) {
        // Remove clustering layers if they exist
        if (clusterSourceAdded) {
            ["clusters", "cluster-count"].forEach((layer) => {
                if (map.getLayer(layer)) map.removeLayer(layer);
            });
            if (map.getSource("outlets")) map.removeSource("outlets");
            clusterSourceAdded = false;
        }
        // Clear unclustered markers
        unclusteredMarkers.forEach((m) => m.remove());
        unclusteredMarkers = [];

        outlets.forEach((outlet) => {
            const brand = $brands.find((b) => b.id === outlet.brand);
            const brandName = brand?.name || "Unknown";

            // Use cached logo URL
            let logoUrl = brandLogoCache.get(outlet.brand);
            if (logoUrl === undefined && brand) {
                logoUrl = getLogoUrl("brands", brand.id, brand.logo);
                brandLogoCache.set(outlet.brand, logoUrl);
            }

            // Create Custom Marker
            const el = document.createElement("div");
            el.className = "custom-marker-wrapper";

            if (logoUrl) {
                el.innerHTML = `
                    <div class="custom-marker-image-container" style="width: 40px; height: 40px; background: white; border-radius: 50%; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; overflow: hidden;">
                        <img src="${logoUrl}" alt="${brandName}" class="marker-logo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
                        <div class="marker-pointer" style="position: absolute; bottom: -5px; left: 50%; transform: translateX(-50%) rotate(45deg); width: 12px; height: 12px; background: white; z-index: -1;"></div>
                    </div>
                `;
            } else {
                el.innerHTML = `<div class="custom-marker fallback"><i class="fas fa-store"></i></div>`;
            }

            // Interactions
            el.addEventListener("mouseenter", () => {
                el.style.zIndex = "100";
                const container = el.querySelector(
                    ".custom-marker-image-container",
                ) as HTMLElement;
                if (container) container.style.transform = "scale(1.2)";
            });
            el.addEventListener("mouseleave", () => {
                el.style.zIndex = "auto";
                const container = el.querySelector(
                    ".custom-marker-image-container",
                ) as HTMLElement;
                if (container) container.style.transform = "scale(1)";
            });

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([outlet.longitude, outlet.latitude])
                .addTo(map);

            el.addEventListener("click", () => {
                // Remove existing popup if any
                if (currentPopup) currentPopup.remove();

                // Set selected outlet for sidebar
                selectedOutlet.set(outlet);

                // Open sidebar if hidden
                const sidebar = document.getElementById("sidebar");
                if (sidebar && sidebar.classList.contains("hidden")) {
                    sidebar.classList.remove("hidden");
                }

                // Fly to location
                map.flyTo({
                    center: [outlet.longitude, outlet.latitude],
                    zoom: 16,
                    padding: { left: 400 }, // Offset for sidebar (desktop)
                });
            });

            markers.push(marker);
        });
    }

    function createPopupContent(
        outlet: Outlet,
        brandName: string,
        logoUrl: string,
    ): string {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${outlet.latitude},${outlet.longitude}`;
        const website = $brands.find((b) => b.id === outlet.brand)?.website;

        const styles = {
            card: "width: 380px; font-family: 'Inter', sans-serif; overflow: hidden; background: white; border-radius: 12px;",
            header: "background: #f8fafc; padding: 12px 16px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #e2e8f0;",
            logoBox:
                "width: 32px; height: 32px; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: white; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center;",
            logo: "width: 100%; height: 100%; object-fit: cover; display: block;",
            brandName:
                "font-size: 13px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;",
            body: "padding: 0;",
            outletName:
                "margin: 16px 16px 8px 16px; font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.4;",
            infoRow:
                "display: flex; gap: 10px; margin: 0 16px 8px 16px; color: #64748b; font-size: 13px; align-items: flex-start;",
            icon: "width: 16px; text-align: center; margin-top: 3px; color: #94a3b8;",
            actions:
                "padding: 16px; display: flex; gap: 10px; border-top: 1px solid #f1f5f9; margin-top: 8px;",
            btnPrimary:
                "flex: 1; background: #3b82f6; color: white; padding: 8px 12px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; border: none;",
            btnSecondary:
                "flex: 1; background: white; color: #475569; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 500; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px;",
            btnGoogle:
                "flex: 1; background: #22c55e; color: white; padding: 8px 12px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px;",
        };

        const headerContent = logoUrl
            ? `<div style="${styles.logoBox}"><img src="${logoUrl}" alt="${brandName}" style="${styles.logo}"></div><div style="${styles.brandName}">${brandName}</div>`
            : `<div style="${styles.brandName}">${brandName}</div>`;

        return `
            <div style="${styles.card}">
                <div style="${styles.header}">
                    ${headerContent}
                </div>
                <div style="${styles.body}">
                    <h3 style="${styles.outletName}">${outlet.name}</h3>
                    <div style="${styles.infoRow}">
                        <i class="fas fa-map-marker-alt" style="${styles.icon}"></i>
                        <span style="flex: 1">${outlet.address || "Alamat tidak tersedia"}</span>
                    </div>
                    <div style="${styles.infoRow}">
                        <i class="fas fa-city" style="${styles.icon}"></i>
                        <span>${outlet.city || "Kota tidak diketahui"}${outlet.region ? ", " + outlet.region : ""}</span>
                    </div>
                </div>
                <div style="${styles.actions}">
                    <button class="nav-btn-internal" style="${styles.btnPrimary}">
                        <i class="fas fa-route"></i> Navigasi
                    </button>
                    <a href="${mapsUrl}" target="_blank" style="${styles.btnGoogle}">
                        <i class="fab fa-google"></i> G Maps
                    </a>
                    ${website ? `<a href="${website}" target="_blank" style="${styles.btnSecondary}"><i class="fas fa-globe"></i></a>` : ""}
                </div>
            </div>
        `;
    }

    async function navigateToOutlet(outlet: Outlet) {
        const userLoc = $userLocation;
        if (!userLoc) {
            alert("Lokasi Anda belum tersedia. Silakan aktifkan izin lokasi.");
            return;
        }

        isNavigating.set(true);
        navigationTarget.set(outlet);

        // Close popup
        if (currentPopup) currentPopup.remove();

        // Fetch route from OSRM
        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${userLoc.lng},${userLoc.lat};${outlet.longitude},${outlet.latitude}?overview=full&geometries=geojson`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.routes && data.routes.length > 0) {
                const coords = data.routes[0].geometry.coordinates as [
                    number,
                    number,
                ][];
                routeCoordinates.set(coords);

                // Fit map to route
                const bounds = new maplibregl.LngLatBounds();
                coords.forEach(([lng, lat]) => bounds.extend([lng, lat]));
                map.fitBounds(bounds, { padding: 100 });

                // Show route info
                const distance = (data.routes[0].distance / 1000).toFixed(1);
                const duration = Math.round(data.routes[0].duration / 60);
                showRouteInfo(distance, duration, outlet.name);
            }
        } catch (e) {
            alert("Gagal mengambil rute. Coba lagi nanti.");
            isNavigating.set(false);
        }
    }

    function drawRoute(coords: [number, number][]) {
        if (!map) return;

        // Remove existing route
        if (map.getLayer("route-line")) map.removeLayer("route-line");
        if (map.getSource("route")) map.removeSource("route");

        // Add route source and layer
        map.addSource("route", {
            type: "geojson",
            data: {
                type: "Feature",
                properties: {},
                geometry: {
                    type: "LineString",
                    coordinates: coords,
                },
            },
        });

        map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
            paint: {
                "line-color": "#3b82f6",
                "line-width": 5,
                "line-opacity": 0.8,
            },
        });
    }

    function showRouteInfo(
        distance: string,
        duration: number,
        destinationName: string,
    ) {
        // Create route info panel
        const existingPanel = document.querySelector(".route-info-panel");
        if (existingPanel) existingPanel.remove();

        const panel = document.createElement("div");
        panel.className = "route-info-panel";
        panel.innerHTML = `
            <div style="background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); padding: 16px; max-width: 300px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                    <div>
                        <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Tujuan</div>
                        <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${destinationName}</div>
                    </div>
                    <button class="close-route-btn" style="background: none; border: none; cursor: pointer; color: #94a3b8; font-size: 18px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="display: flex; gap: 20px;">
                    <div>
                        <div style="font-size: 24px; font-weight: 700; color: #3b82f6;">${distance}</div>
                        <div style="font-size: 12px; color: #64748b;">km</div>
                    </div>
                    <div>
                        <div style="font-size: 24px; font-weight: 700; color: #3b82f6;">${duration}</div>
                        <div style="font-size: 12px; color: #64748b;">menit</div>
                    </div>
                </div>
            </div>
        `;

        panel.style.cssText =
            "position: absolute; top: 20px; left: 50%; transform: translateX(-50%); z-index: 1000;";
        mapContainer.appendChild(panel);

        // Close button handler
        panel
            .querySelector(".close-route-btn")
            ?.addEventListener("click", clearRoute);
    }

    function clearRoute() {
        if (map.getLayer("route-line")) map.removeLayer("route-line");
        if (map.getSource("route")) map.removeSource("route");
        routeCoordinates.set([]);
        isNavigating.set(false);
        navigationTarget.set(null);

        const panel = document.querySelector(".route-info-panel");
        if (panel) panel.remove();
    }

    function locateUser() {
        isLocating = true;
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    userLocation.set({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                    });
                    map.flyTo({
                        center: [pos.coords.longitude, pos.coords.latitude],
                        zoom: 15,
                    });
                    isLocating = false;
                },
                () => {
                    isLocating = false;
                    alert("Tidak dapat mengakses lokasi Anda.");
                },
            );
        }
    }

    function toggleSidebar() {
        const sidebar = document.getElementById("sidebar");
        if (sidebar) sidebar.classList.toggle("hidden");
    }

    function zoomIn() {
        map.zoomIn();
    }
    function zoomOut() {
        map.zoomOut();
    }
    function resetView() {
        clearRoute();
        map.flyTo({ center: [118.0, -2.5], zoom: 5, pitch: 0, bearing: 0 });
    }
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    function setMapStyleType(style: MapStyleType) {
        mapStyle.set(style);
        isMapStylePanelOpen = false;
    }
</script>

<div class="map-container">
    <div id="map" bind:this={mapContainer}></div>

    <!-- Floating Controls Left -->
    <div class="floating-controls left">
        <button
            class="control-fab"
            onclick={toggleSidebar}
            title="Toggle Sidebar"
        >
            <i class="fas fa-bars"></i>
        </button>
    </div>

    <!-- Floating Controls Right -->
    <div class="floating-controls right">
        <button
            class="control-fab"
            onclick={() => (isMapStylePanelOpen = !isMapStylePanelOpen)}
            title="Jenis Peta"
        >
            <i class="fas fa-layer-group"></i>
        </button>
        <button class="control-fab" onclick={zoomIn} title="Zoom In">
            <i class="fas fa-plus"></i>
        </button>
        <button class="control-fab" onclick={zoomOut} title="Zoom Out">
            <i class="fas fa-minus"></i>
        </button>
        <button
            class="control-fab"
            onclick={locateUser}
            title="My Location"
            class:loading={isLocating}
        >
            <i
                class="fas fa-{isLocating
                    ? 'spinner fa-spin'
                    : 'location-crosshairs'}"
            ></i>
        </button>
        <button class="control-fab" onclick={resetView} title="Reset View">
            <i class="fas fa-compress-arrows-alt"></i>
        </button>
        <button
            class="control-fab"
            onclick={toggleFullscreen}
            title="Fullscreen"
        >
            <i class="fas fa-expand"></i>
        </button>
    </div>

    <!-- Map Style Panel -->
    {#if isMapStylePanelOpen}
        <div class="map-style-panel">
            <div class="map-style-header">
                <span>Jenis Peta</span>
                <button
                    class="close-btn"
                    onclick={() => (isMapStylePanelOpen = false)}
                    aria-label="Close"
                >
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="map-style-grid">
                <button
                    class="map-style-option"
                    class:active={$mapStyle === "default"}
                    onclick={() => setMapStyleType("default")}
                >
                    <div
                        class="style-preview"
                        style="background-image: url('https://basemaps.cartocdn.com/light_all/5/26/16.png'); background-size: cover; background-position: center;"
                    ></div>
                    <span>Default</span>
                </button>
                <button
                    class="map-style-option"
                    class:active={$mapStyle === "satellite"}
                    onclick={() => setMapStyleType("satellite")}
                >
                    <div
                        class="style-preview"
                        style="background-image: url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/5/16/26'); background-size: cover; background-position: center;"
                    ></div>
                    <span>Satelit</span>
                </button>
                <button
                    class="map-style-option"
                    class:active={$mapStyle === "terrain"}
                    onclick={() => setMapStyleType("terrain")}
                >
                    <div
                        class="style-preview"
                        style="background-image: url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/5/16/26'); background-size: cover; background-position: center;"
                    ></div>
                    <span>Terrain</span>
                </button>
                <button
                    class="map-style-option"
                    class:active={$mapStyle === "3d"}
                    onclick={() => setMapStyleType("3d")}
                >
                    <div
                        class="style-preview"
                        style="background-image: url('https://basemaps.cartocdn.com/rastertiles/voyager/5/26/16.png'); background-size: cover; background-position: center;"
                    ></div>
                    <span>3D Gedung</span>
                </button>
            </div>
        </div>
    {/if}

    <!-- Legend Panel -->
    <div class="legend-panel" class:collapsed={isLegendCollapsed}>
        <div class="legend-header">
            <i class="fas fa-palette"></i>
            <span>Legenda</span>
            <button
                class="legend-close"
                onclick={() => (isLegendCollapsed = !isLegendCollapsed)}
                aria-label="Toggle Legend"
            >
                <i
                    class="fas fa-chevron-down"
                    style="transform: {isLegendCollapsed
                        ? 'rotate(180deg)'
                        : 'rotate(0)'}"
                ></i>
            </button>
        </div>
        <div class="legend-content">
            {#each $brands as brand}
                {@const logoUrl = getLogoUrl("brands", brand.id, brand.logo)}
                <div class="legend-item">
                    {#if logoUrl}
                        <img
                            src={logoUrl}
                            alt={brand.name}
                            class="legend-logo"
                            style="width: 20px; height: 20px; object-fit: contain; margin-right: 8px;"
                        />
                    {:else}
                        <div
                            class="legend-dot"
                            style="background-color: #8b5cf6;"
                        ></div>
                    {/if}
                    <span>{brand.name}</span>
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
    .map-style-panel {
        position: absolute;
        top: 20px;
        right: 70px;
        background: var(--bg-glass);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        padding: 16px;
        z-index: 100;
        min-width: 210px;
    }

    .map-style-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--text-primary);
    }

    .map-style-header .close-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--text-muted);
        font-size: 14px;
        width: 28px;
        height: 28px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .map-style-header .close-btn:hover {
        background: var(--bg-card);
        color: var(--text-primary);
    }

    .map-style-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
    }

    .map-style-option {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 8px;
        border: 2px solid transparent;
        border-radius: 12px;
        background: var(--bg-card);
        cursor: pointer;
        transition: all 0.2s;
    }

    .map-style-option:hover {
        border-color: var(--accent-primary);
        transform: translateY(-2px);
    }

    .map-style-option.active {
        border-color: var(--accent-primary);
        background: rgba(139, 92, 246, 0.08);
        box-shadow: 0 0 0 1px var(--accent-primary);
    }

    .map-style-option span {
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--text-secondary);
        letter-spacing: 0.3px;
    }

    .map-style-option.active span {
        color: var(--accent-primary);
    }

    .style-preview {
        width: 60px;
        height: 60px;
        border-radius: 10px;
        background-size: cover;
        background-position: center;
        border: 1px solid var(--border-color);
        overflow: hidden;
    }

    .control-fab.loading {
        opacity: 0.7;
        pointer-events: none;
    }

</style>
