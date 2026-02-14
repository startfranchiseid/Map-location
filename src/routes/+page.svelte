<script lang="ts">
    import { onMount } from "svelte";
    import Header from "$lib/components/Header.svelte";
    import Sidebar from "$lib/components/Sidebar.svelte";
    import MapComponent from "$lib/components/Map.svelte";
    import { brands, outlets, selectedBrands, isLoading } from "$lib/stores";
    import { getBrands, getAllOutletsWithBrands } from "$lib/pocketbase";

    let loadingText = "Memuat data...";
    let loadingProgress = 0;

    onMount(async () => {
        try {
            const startTime = performance.now();
            console.log("Starting data load...");
            
            loadingText = "Mengambil data brand...";
            loadingProgress = 20;
            
            // Fetch brands and outlets in parallel for faster loading
            const [brandsData, outletsData] = await Promise.all([
                getBrands(),
                getAllOutletsWithBrands()
            ]);
            
            loadingProgress = 70;
            loadingText = "Memproses data...";
            
            console.log("Brands loaded:", brandsData.length);
            console.log("Outlets loaded:", outletsData.length);
            
            brands.set(brandsData);

            // Select all brands by default
            selectedBrands.set(new Set(brandsData.map((b) => b.id)));

            if (outletsData.length === 0) {
                console.warn("No outlets returned from API. Checking fallback...");
            }

            outlets.set(outletsData);
            
            loadingProgress = 100;
            
            const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`Data loaded in ${loadTime}s`);

            isLoading.set(false);
        } catch (error) {
            console.error("Error loading data:", error);
            loadingText = "Gagal memuat data. Menggunakan data lokal...";
            await loadLocalData();
        }
    });

    async function loadLocalData() {
        try {
            console.log("Loading local data...");
            const response = await fetch("/brand_locations.json").catch(() =>
                fetch("/data/brand_locations.json"),
            );

            if (!response || !response.ok)
                throw new Error("Local data not found");

            const data = await response.json();

            const brandsMap = new Map();
            const processedOutlets: any[] = [];

            for (const brand of data.brands) {
                const brandId = brand.brandName.toLowerCase().replace(/\s+/g, "-");
                brandsMap.set(brandId, {
                    id: brandId,
                    name: brand.brandName,
                    category: brand.category,
                    website: brand.website,
                    logo: "",
                    created: new Date().toISOString(),
                    updated: new Date().toISOString(),
                });

                const processOutlets = (outlets: any[], region?: string) => {
                    if (!outlets) return;
                    for (const outlet of outlets) {
                        if (outlet.coordinates?.lat && outlet.coordinates?.lng) {
                            processedOutlets.push({
                                id: `${brandId}-${processedOutlets.length}`,
                                brand: brandId,
                                name: outlet.name,
                                address: outlet.address,
                                city: outlet.city,
                                region: region || "",
                                latitude: outlet.coordinates.lat,
                                longitude: outlet.coordinates.lng,
                                created: new Date().toISOString(),
                                updated: new Date().toISOString(),
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
            setTimeout(() => isLoading.set(false), 2000);
        }
    }
</script>

<div class="app-container">
    {#if $isLoading}
        <div class="loading-overlay">
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-text">{loadingText}</div>
                <div class="loading-progress-bar">
                    <div class="loading-progress-fill" style="width: {loadingProgress}%"></div>
                </div>
            </div>
        </div>
    {/if}

    <Header />

    <main class="main-content">
        <Sidebar />
        <MapComponent />
    </main>
</div>
