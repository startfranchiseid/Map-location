<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import maplibregl from "maplibre-gl";
    import {
        theme,
        filteredOutlets,
        brands,
        selectedBrands,
    } from "$lib/stores";
    import { getLogoUrl } from "$lib/pocketbase";
    import type { Outlet } from "$lib/pocketbase";

    let mapContainer: HTMLDivElement;
    let map: maplibregl.Map;
    let markers: maplibregl.Marker[] = [];
    let currentPopup: maplibregl.Popup | null = null;
    let isLegendCollapsed = false;

    // Use MapBox/Carto styles
    const mapStyles = {
        dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    };

    onMount(() => {
        map = new maplibregl.Map({
            container: mapContainer,
            style: mapStyles[$theme],
            center: [118.0, -2.5],
            zoom: 5,
            minZoom: 4,
            maxZoom: 18,
            attributionControl: false,
        });

        map.addControl(
            new maplibregl.NavigationControl({ showCompass: false }),
            "bottom-right",
        );

        map.on("load", () => {
            updateMarkers($filteredOutlets);
        });
    });

    onDestroy(() => {
        if (map) map.remove();
    });

    // Reactive statement for updates
    $: if (map && $filteredOutlets) {
        if (map.loaded()) {
            updateMarkers($filteredOutlets);
        } else {
            map.once("load", () => updateMarkers($filteredOutlets));
        }
    }

    $: if (map && $theme) {
        const style = mapStyles[$theme];
        // Check if style is actually different to avoid reload loops
        // simplified for now just set and update
        map.setStyle(style);
        map.once("styledata", () => {
            updateMarkers($filteredOutlets);
        });
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

            // Create Custom Marker (Image)
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
                // Fallback if no logo
                el.innerHTML = `<div class="custom-marker fallback"><i class="fas fa-store"></i></div>`;
            }

            // Interaction
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

            // Create Popup
            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([outlet.longitude, outlet.latitude])
                .addTo(map);

            el.addEventListener("click", () => {
                if (currentPopup) currentPopup.remove();

                currentPopup = new maplibregl.Popup({
                    offset: [0, -45], // Adjusted for taller marker
                    closeButton: true,
                    closeOnClick: false,
                    className: "custom-popup",
                })
                    .setLngLat([outlet.longitude, outlet.latitude])
                    .setHTML(createPopupContent(outlet, brandName, logoUrl))
                    .addTo(map);
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

        // Inline styles to guarantee layout
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
                "flex: 1; background: #3b82f6; color: white; padding: 8px 12px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px; transition: background 0.2s;",
            btnSecondary:
                "flex: 1; background: white; color: #475569; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 500; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px;",
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
                    <a href="${mapsUrl}" target="_blank" style="${styles.btnPrimary}">
                        <i class="fas fa-directions"></i> Navigasi
                    </a>
                    ${website ? `<a href="${website}" target="_blank" style="${styles.btnSecondary}"><i class="fas fa-globe"></i> Website</a>` : ""}
                </div>
            </div>
        `;
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
        map.flyTo({ center: [118.0, -2.5], zoom: 5 });
    }
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }
</script>

<div class="map-container">
    <div id="map" bind:this={mapContainer}></div>

    <!-- Floating Controls -->
    <div class="floating-controls left">
        <button
            class="control-fab"
            onclick={toggleSidebar}
            title="Toggle Sidebar"
        >
            <i class="fas fa-bars"></i>
        </button>
    </div>

    <div class="floating-controls right">
        <button class="control-fab" onclick={zoomIn} title="Zoom In">
            <i class="fas fa-plus"></i>
        </button>
        <button class="control-fab" onclick={zoomOut} title="Zoom Out">
            <i class="fas fa-minus"></i>
        </button>
        <button class="control-fab" onclick={resetView} title="Reset View">
            <i class="fas fa-location-crosshairs"></i>
        </button>
        <button
            class="control-fab"
            onclick={toggleFullscreen}
            title="Fullscreen"
        >
            <i class="fas fa-expand"></i>
        </button>
    </div>

    <!-- Legend Panel -->
    <div class="legend-panel" class:collapsed={isLegendCollapsed}>
        <div class="legend-header">
            <i class="fas fa-palette"></i>
            <span>Legenda</span>
            <button
                class="legend-close"
                onclick={() => (isLegendCollapsed = !isLegendCollapsed)}
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
