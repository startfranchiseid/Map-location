<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import maplibregl from "maplibre-gl";
    import {
        theme,
        filteredOutlets,
        brands,
        selectedBrands,
        mapStyle,
        userLocation,
        isNavigating,
        navigationTarget,
        routeCoordinates,
        type MapStyleType,
    } from "$lib/stores";
    import { getLogoUrl } from "$lib/pocketbase";
    import type { Outlet } from "$lib/pocketbase";

    let mapContainer: HTMLDivElement;
    let map: maplibregl.Map;
    let markers: maplibregl.Marker[] = [];
    let currentPopup: maplibregl.Popup | null = null;
    let userMarker: maplibregl.Marker | null = null;
    let isLegendCollapsed = false;
    let isMapStylePanelOpen = false;
    let isLocating = false;
    let routeLayer: string | null = null;

    // Map styles configuration
    const mapStyles = {
        default: {
            dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
            light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        },
        satellite:
            "https://api.maptiler.com/maps/hybrid/style.json?key=get_your_own_key",
        terrain:
            "https://api.maptiler.com/maps/outdoor/style.json?key=get_your_own_key",
        "3d": "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
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
            maxZoom: 18,
            attributionControl: false,
            pitch: 0,
            bearing: 0,
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
        if (map.loaded()) {
            updateMarkers($filteredOutlets);
        } else {
            map.once("load", () => updateMarkers($filteredOutlets));
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

    // Route drawing handler
    $: if (map && $routeCoordinates.length > 0) {
        if (map.loaded()) {
            drawRoute($routeCoordinates);
        } else {
            map.once("load", () => drawRoute($routeCoordinates));
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
                // Enable 3D pitch
                map.easeTo({ pitch: 60, bearing: -20, duration: 1000 });
                break;
            default:
                newStyle = mapStyles.default[$theme];
                map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
        }

        map.setStyle(newStyle);
        map.once("styledata", () => {
            updateMarkers($filteredOutlets);
            if ($routeCoordinates.length > 0) drawRoute($routeCoordinates);

            // Add 3D buildings for 3D style
            if (style === "3d") {
                add3DBuildings();
            }
        });
    }

    function add3DBuildings() {
        if (!map.getSource("openmaptiles")) return;

        // Add 3D building layer
        if (!map.getLayer("3d-buildings")) {
            map.addLayer({
                id: "3d-buildings",
                source: "openmaptiles",
                "source-layer": "building",
                type: "fill-extrusion",
                minzoom: 14,
                paint: {
                    "fill-extrusion-color": "#aaa",
                    "fill-extrusion-height": ["get", "height"],
                    "fill-extrusion-base": 0,
                    "fill-extrusion-opacity": 0.6,
                },
            });
        }
    }

    function updateMarkers(outlets: Outlet[]) {
        markers.forEach((m) => m.remove());
        markers = [];

        outlets.forEach((outlet) => {
            const brand = $brands.find((b) => b.id === outlet.brand);
            const brandName = brand?.name || "Unknown";
            const logoUrl = brand
                ? getLogoUrl("brands", brand.id, brand.logo)
                : "";

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
                if (currentPopup) currentPopup.remove();

                currentPopup = new maplibregl.Popup({
                    offset: [0, -45],
                    closeButton: true,
                    closeOnClick: false,
                    className: "custom-popup",
                })
                    .setLngLat([outlet.longitude, outlet.latitude])
                    .setHTML(createPopupContent(outlet, brandName, logoUrl))
                    .addTo(map);

                // Attach navigation event after popup is added
                setTimeout(() => {
                    const navBtn = document.querySelector(".nav-btn-internal");
                    if (navBtn) {
                        navBtn.addEventListener("click", () =>
                            navigateToOutlet(outlet),
                        );
                    }
                }, 100);
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
                    <div class="style-preview default-preview"></div>
                    <span>Default</span>
                </button>
                <button
                    class="map-style-option"
                    class:active={$mapStyle === "satellite"}
                    onclick={() => setMapStyleType("satellite")}
                >
                    <div class="style-preview satellite-preview"></div>
                    <span>Satelit</span>
                </button>
                <button
                    class="map-style-option"
                    class:active={$mapStyle === "terrain"}
                    onclick={() => setMapStyleType("terrain")}
                >
                    <div class="style-preview terrain-preview"></div>
                    <span>Terrain</span>
                </button>
                <button
                    class="map-style-option"
                    class:active={$mapStyle === "3d"}
                    onclick={() => setMapStyleType("3d")}
                >
                    <div class="style-preview preview-3d"></div>
                    <span>3D</span>
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
        right: 70px; /* Positioned to the left of the controls */
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        padding: 16px;
        z-index: 100;
        min-width: 200px;
    }

    .map-style-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        font-weight: 600;
        color: #1e293b;
    }

    .map-style-header .close-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: #94a3b8;
        font-size: 14px;
    }

    .map-style-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
    }

    .map-style-option {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 8px;
        border: 2px solid transparent;
        border-radius: 8px;
        background: #f8fafc;
        cursor: pointer;
        transition: all 0.2s;
    }

    .map-style-option:hover {
        background: #e2e8f0;
    }

    .map-style-option.active {
        border-color: #3b82f6;
        background: #eff6ff;
    }

    .map-style-option span {
        font-size: 11px;
        font-weight: 500;
        color: #475569;
    }

    .style-preview {
        width: 50px;
        height: 50px;
        border-radius: 6px;
        background-size: cover;
        background-position: center;
    }

    .default-preview {
        background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
    }

    .satellite-preview {
        background: linear-gradient(
            135deg,
            #065f46 0%,
            #064e3b 50%,
            #022c22 100%
        );
    }

    .terrain-preview {
        background: linear-gradient(
            135deg,
            #84cc16 0%,
            #65a30d 50%,
            #4d7c0f 100%
        );
    }

    :global(.preview-3d) {
        background: linear-gradient(
            135deg,
            #6366f1 0%,
            #4f46e5 50%,
            #4338ca 100%
        );
    }

    .control-fab.loading {
        opacity: 0.7;
        pointer-events: none;
    }
</style>
