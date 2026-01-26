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
        // Only toggle visible brands (based on category)
        const visibleBrandIds = $brands
            .filter(
                (b) =>
                    $selectedCategory === "All" ||
                    b.category === $selectedCategory,
            )
            .map((b) => b.id);

        // Check if all VISIBLE brands are currently selected
        // We consider "all selected" if every visible brand is in the set
        const allSelected =
            visibleBrandIds.length > 0 &&
            visibleBrandIds.every((id) => $selectedBrands.has(id));

        selectedBrands.update((set) => {
            const newSet = new Set(set);
            if (allSelected) {
                // Deselect all visible
                visibleBrandIds.forEach((id) => newSet.delete(id));
            } else {
                // Select all visible
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
                    <button class="search-clear" onclick={clearSearch}>
                        <i class="fas fa-times"></i>
                    </button>
                {/if}
            </div>
        </div>

        <!-- Filter Header -->
        <div class="filter-header">
            <h3><i class="fas fa-layer-group"></i> Filter</h3>
            <button class="btn-toggle-all" onclick={toggleAll}>
                <i class="fas fa-eye"></i>
                <span>Toggle</span>
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
            {#each $brands as brand (brand.id)}
                {#if $selectedCategory === "All" || brand.category === $selectedCategory}
                    {@const isSelected = $selectedBrands.has(brand.id)}
                    {@const logoUrl = getLogoUrl(
                        "brands",
                        brand.id,
                        brand.logo,
                    )}
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
                                {brand.category || "Uncategorized"} • {count} outlet
                            </div>
                        </div>
                    </div>
                {/if}
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
