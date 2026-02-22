<script lang="ts">
    import { onMount } from "svelte";
    import Header from "$lib/components/Header.svelte";
    import Sidebar from "$lib/components/Sidebar.svelte";
    import MapComponent from "$lib/components/Map.svelte";
    import OutletDetail from "$lib/components/OutletDetail.svelte";
    import AiChat from "$lib/components/AiChat.svelte";
    import {
        brands,
        outlets,
        selectedBrands,
        isLoading,
        categoriesData,
        mapAction,
    } from "$lib/stores";
    import {
        getBrands,
        getAllOutletsWithBrands,
        getCategories,
    } from "$lib/pocketbase";

    let loadingText = "Memuat data...";
    let loadingProgress = 0;
    let pendingFocusOutletId: string | null = null;

    onMount(async () => {
        try {
            pendingFocusOutletId = new URLSearchParams(
                window.location.search,
            ).get("focus");
            const startTime = performance.now();
            console.log("Starting data load...");

            loadingText = "Mengambil data brand...";
            loadingProgress = 20;

            // Phase 1: Fetch brands and categories first to unblock UI
            const [brandsData, categoriesResult] = await Promise.all([
                getBrands(),
                getCategories(),
            ]);

            loadingProgress = 50;
            loadingText = "Memproses data brand...";

            console.log("Brands loaded:", brandsData.length);
            brands.set(brandsData);
            categoriesData.set(categoriesResult);

            // Unblock UI immediately
            isLoading.set(false);

            // Phase 2: Fetch outlets in background
            loadingText = "Memuat data outlet...";
            // Although isLoading is false, we can still update loadingText if we want to show a toast or small indicator,
            // but here the main overlay is gone. We fetch data now.

            const outletsData = await getAllOutletsWithBrands();
            console.log("Outlets loaded (background):", outletsData.length);

            if (outletsData.length === 0) {
                console.warn("No outlets returned from API or cache.");
            }

            outlets.set(outletsData);

            const loadTime = ((performance.now() - startTime) / 1000).toFixed(
                2,
            );
            console.log(`Total data loaded in ${loadTime}s`);
        } catch (error) {
            console.error("Error loading data:", error);
            // If brands failed, we might want to try local data
            if ($brands.length === 0) {
                loadingText = "Gagal memuat data. Menggunakan data lokal...";
                await loadLocalData();
            }
        }
    });

    $: if (pendingFocusOutletId && $outlets.length > 0) {
        mapAction.set({
            type: "open_outlet_detail",
            outletId: pendingFocusOutletId,
        });
        pendingFocusOutletId = null;
    }

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
            const localCategories = new Map<
                string,
                { id: string; name: string; created: string; updated: string }
            >();
            const now = new Date().toISOString();
            const processedOutlets: any[] = [];

            for (const brand of data.brands) {
                const brandId = brand.brandName
                    .toLowerCase()
                    .replace(/\s+/g, "-");
                if (brand.category && !localCategories.has(brand.category)) {
                    localCategories.set(brand.category, {
                        id: brand.category,
                        name: brand.category,
                        created: now,
                        updated: now,
                    });
                }
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
            categoriesData.set(Array.from(localCategories.values()));
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
                    <div
                        class="loading-progress-fill"
                        style="width: {loadingProgress}%"
                    ></div>
                </div>
            </div>
        </div>
    {/if}

    <Header />

    <main class="main-content">
        <Sidebar />
        <MapComponent />
        <OutletDetail />
        <AiChat />
    </main>
</div>
