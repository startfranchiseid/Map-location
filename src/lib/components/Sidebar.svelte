<script lang="ts">
    import {
        brands,
        outlets,
        selectedBrands,
        searchQuery,
        selectedCategory,
        categories,
    } from "$lib/stores";
    import { getLogoUrl } from "$lib/pocketbase";

    function toggleBrand(brandId: string) {
        selectedBrands.update((set) => {
            const newSet = new Set(set);
            if (newSet.has(brandId)) {
                newSet.delete(brandId);
            } else {
                newSet.add(brandId);
            }
            return newSet;
        });
    }

    function toggleAll() {
        const visibleBrandIds = visibleBrands.map((b) => b.id);
        const allSelected =
            visibleBrandIds.length > 0 &&
            visibleBrandIds.every((id) => $selectedBrands.has(id));

        selectedBrands.update((set) => {
            const newSet = new Set(set);
            if (allSelected) {
                visibleBrandIds.forEach((id) => newSet.delete(id));
            } else {
                visibleBrandIds.forEach((id) => newSet.add(id));
            }
            return newSet;
        });
    }

    function getBrandOutletCount(brandId: string): number {
        return $outlets.filter((o) => o.brand === brandId).length;
    }

    function clearSearch() {
        searchQuery.set("");
    }

    // Filter brands based on search query and category
    $: visibleBrands = $brands.filter((brand) => {
        // 1. Category Filter
        if (
            $selectedCategory !== "All" &&
            brand.category !== $selectedCategory
        ) {
            return false;
        }

        // 2. Search Filter
        if ($searchQuery.trim()) {
            const query = $searchQuery.toLowerCase();
            // Check brand name
            if (brand.name.toLowerCase().includes(query)) return true;

            // Check if any outlet matches
            const brandOutlets = $outlets.filter((o) => o.brand === brand.id);
            return brandOutlets.some(
                (o) =>
                    o.name.toLowerCase().includes(query) ||
                    o.address.toLowerCase().includes(query) ||
                    o.city.toLowerCase().includes(query) ||
                    (o.region && o.region.toLowerCase().includes(query)),
            );
        }

        return true;
    });
</script>

<aside class="sidebar" id="sidebar">
    <div class="sidebar-content">
        <!-- Search Section -->
        <div class="search-section">
            <div class="search-wrapper">
                <i class="fas fa-search search-icon"></i>
                <input
                    type="text"
                    placeholder="Cari lokasi, brand, kota..."
                    bind:value={$searchQuery}
                />
                {#if $searchQuery}
                    <button
                        class="search-clear"
                        onclick={clearSearch}
                        aria-label="Clear search"
                    >
                        <i class="fas fa-times"></i>
                    </button>
                {/if}
            </div>
        </div>

        <!-- Filter Header -->
        <div class="filter-header">
            <h3><i class="fas fa-layer-group"></i> Filter</h3>
            <button class="btn-toggle-all" onclick={toggleAll}>
                <i class="fas fa-check"></i>
                <span>Select All</span>
            </button>
        </div>

        <!-- Category Dropdown -->
        <div
            class="category-filter"
            style="padding: 0 20px 12px 20px; border-bottom: 1px solid var(--border-color); margin-top: 10px;"
        >
            <select
                bind:value={$selectedCategory}
                style="width: 100%; padding: 10px; border-radius: 10px; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-primary); cursor: pointer;"
            >
                {#each $categories as category}
                    <option value={category}>{category}</option>
                {/each}
            </select>
        </div>

        <!-- Brand List -->
        <div class="brand-list">
            {#each visibleBrands as brand (brand.id)}
                {@const isSelected = $selectedBrands.has(brand.id)}
                {@const logoUrl = getLogoUrl("brands", brand.id, brand.logo)}
                {@const count = getBrandOutletCount(brand.id)}

                <div
                    class="brand-item {isSelected ? 'active' : ''}"
                    onclick={() => toggleBrand(brand.id)}
                    role="button"
                    tabindex="0"
                    onkeypress={(e) =>
                        e.key === "Enter" && toggleBrand(brand.id)}
                >
                    <div class="brand-toggle">
                        <i class="fas fa-check"></i>
                    </div>

                    <div
                        class="brand-logo-container"
                        style="width: 36px; height: 36px; min-width: 36px; border-radius: 8px; overflow: hidden; margin-right: 12px; background: #f1f5f9; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center;"
                    >
                        {#if logoUrl}
                            <img
                                src={logoUrl}
                                alt={brand.name}
                                class="brand-logo"
                                style="width: 100%; height: 100%; object-fit: cover;"
                            />
                        {:else}
                            <div class="brand-logo-placeholder">
                                {brand.name.substring(0, 2).toUpperCase()}
                            </div>
                        {/if}
                    </div>

                    <div class="brand-details">
                        <div class="brand-name">{brand.name}</div>
                        <div
                            class="brand-meta"
                            style="font-size: 0.7rem; color: var(--text-muted);"
                        >
                            {brand.category || "Uncategorized"} • {brand.total_outlets ??
                                count}
                            outlet
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        <!-- Info Card -->
        <div class="info-card">
            <div class="info-card-header">
                <i class="fas fa-info-circle"></i>
                <span>Tips</span>
            </div>
            <p>
                Klik marker untuk melihat detail lokasi. Gunakan scroll untuk
                zoom peta.
            </p>
        </div>
    </div>
</aside>
