<script lang="ts">
    import { onMount } from "svelte";
    import Header from "$lib/components/Header.svelte";
    import Sidebar from "$lib/components/Sidebar.svelte";
    import Map from "$lib/components/Map.svelte";
    import { brands, outlets, selectedBrands, isLoading } from "$lib/stores";
    import { getBrands, getAllOutletsWithBrands } from "$lib/pocketbase";

    let loadingText = "Memuat data...";

    onMount(async () => {
        try {
            console.log("Starting data load...");
            loadingText = "Mengambil data brand...";
            const brandsData = await getBrands();
            console.log("Brands loaded:", brandsData);
            brands.set(brandsData);

            // Select all brands by default
            selectedBrands.set(new Set(brandsData.map((b) => b.id)));

            loadingText = "Mengambil data outlet...";
            const outletsData = await getAllOutletsWithBrands();
            console.log("Outlets loaded:", outletsData);

            if (outletsData.length === 0) {
                console.warn(
                    "No outlets returned from API. Checking fallback...",
                );
            }

            outlets.set(outletsData);

            isLoading.set(false);
        } catch (error) {
            console.error("Error loading data:", error);
            loadingText = "Gagal memuat data. Menggunakan data lokal...";

            // Fallback: load from local JSON
            await loadLocalData();
        }
    });

    async function loadLocalData() {
        try {
            console.log("Loading local data...");
            // Try to fetch from root or data folder.
            // Note: In SvelteKit dev, data at root might not be served unless configured.
            // We'll try a flexible path.
            const response = await fetch("/brand_locations.json").catch(() =>
                fetch("/data/brand_locations.json"),
            );

            if (!response || !response.ok)
                throw new Error("Local data not found");

            const data = await response.json();

            // Process local data
            const brandsMap = new Map();
            const processedOutlets: any[] = [];

            for (const brand of data.brands) {
                const brandId = brand.brandName
                    .toLowerCase()
                    .replace(/\s+/g, "-");
                brandsMap.set(brandId, {
                    id: brandId,
                    name: brand.brandName,
                    category: brand.category,
                    website: brand.website,
                    logo: "", // No logo in local JSON
                    created: new Date().toISOString(),
                    updated: new Date().toISOString(),
                });

                const processOutlets = (outlets: any[], region?: string) => {
                    for (const outlet of outlets) {
                        if (
                            outlet.coordinates?.lat &&
                            outlet.coordinates?.lng
                        ) {
                            processedOutlets.push({
                                id: `${brandId}-${processedOutlets.length}`,
                                brand: brandId,
                                name: outlet.name,
                                address: outlet.address,
                                city: outlet.city,
                                region: region || "",
                                latitude: outlet.coordinates.lat,
                                longitude: outlet.coordinates.lng,
                            });
                        }
                    }
                };

                if (brand.regions) {
                    for (const region of brand.regions) {
                        processOutlets(region.outlets, region.region);
                    }
                }
                if (brand.outlets) {
                    processOutlets(brand.outlets);
                }
            }

            brands.set(Array.from(brandsMap.values()));
            selectedBrands.set(new Set(brandsMap.keys()));
            outlets.set(processedOutlets);
            isLoading.set(false);
        } catch (err) {
            console.error("Error loading local data:", err);
            loadingText = "Gagal memuat data sepenuhnya.";
            setTimeout(() => isLoading.set(false), 2000); // Force close overlay
        }
    }
</script>

<div class="app-container">
    {#if $isLoading}
        <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <div class="loading-text">{loadingText}</div>
        </div>
    {/if}

    <Header />

    <main class="main-content">
        <Sidebar />
        <Map />
    </main>
</div>
