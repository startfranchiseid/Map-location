<script lang="ts">
    import {
        brands,
        outlets,
        selectedBrands,
        searchQuery,
        selectedCategory,
        categories,
        selectedOutlet,
        isNavigating,
        navigationTarget,
    } from "$lib/stores";
    import { getLogoUrl, getOutletDetails, type Outlet } from "$lib/pocketbase";

    // Full outlet details (fetched on selection)
    let detailOutlet: Outlet | null = null;
    let isLoadingDetail = false;
    let currentImageIndex = 0;

    // Fetch full details when outlet is selected
    $: if ($selectedOutlet) {
        loadOutletDetails($selectedOutlet.id);
    } else {
        detailOutlet = null;
        currentImageIndex = 0;
    }

    async function loadOutletDetails(outletId: string) {
        isLoadingDetail = true;
        currentImageIndex = 0;
        try {
            const details = await getOutletDetails(outletId);
            if (details) {
                detailOutlet = details;
            } else {
                detailOutlet = $selectedOutlet;
            }
        } catch {
            detailOutlet = $selectedOutlet;
        }
        isLoadingDetail = false;
    }

    // Helper: Get all images
    function getAllImages(outlet: Outlet): string[] {
        const imgs: string[] = [];
        if (outlet.imageUrls && Array.isArray(outlet.imageUrls)) {
            imgs.push(...outlet.imageUrls);
        }
        if (outlet.imageUrl && !imgs.includes(outlet.imageUrl)) {
            imgs.push(outlet.imageUrl);
        }
        return imgs;
    }

    // Image gallery navigation
    function nextImage() {
        if (!detailOutlet) return;
        const images = getAllImages(detailOutlet);
        currentImageIndex = (currentImageIndex + 1) % images.length;
    }
    function prevImage() {
        if (!detailOutlet) return;
        const images = getAllImages(detailOutlet);
        currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
    }

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
        const visibleBrandIds = $brands
            .filter(
                (b) =>
                    $selectedCategory === "All" ||
                    b.category === $selectedCategory,
            )
            .map((b) => b.id);

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

    function closeDetail() {
        selectedOutlet.set(null);
    }

    function startNavigation(outlet: Outlet) {
        isNavigating.set(true);
        navigationTarget.set(outlet);
        // Mobile view might want to close sidebar here
    }

    function getWhatsappLink(outlet: Outlet): string | null {
        // Check for rich booking link first
        const waLink = outlet.bookingLinks?.find(
            (l: any) =>
                l.name === "wa.link" ||
                l.url?.includes("wa.me") ||
                l.url?.includes("whatsapp"),
        )?.url;
        if (waLink) return waLink;

        // Fallback to formatted phone
        if (outlet.phoneUnformatted)
            return `https://wa.me/${outlet.phoneUnformatted.replace(/[^0-9]/g, "")}`;
        if (outlet.phone)
            return `https://wa.me/${outlet.phone.replace(/[^0-9]/g, "")}`;

        return null;
    }

    $: activeBrand = $selectedOutlet
        ? $brands.find((b) => b.id === $selectedOutlet!.brand)
        : null;
    $: activeLogo = activeBrand
        ? getLogoUrl("brands", activeBrand.id, activeBrand.logo)
        : "";
</script>

<aside class="sidebar" id="sidebar">
    <div class="sidebar-content">
        {#if $selectedOutlet}
            <!-- DETAIL VIEW -->
            {@const outlet = detailOutlet || $selectedOutlet}
            {@const images = getAllImages(outlet)}
            <div class="detail-view">
                <!-- Hero Image Gallery -->
                <div class="detail-hero">
                    <button
                        class="btn-back"
                        onclick={closeDetail}
                        title="Kembali"
                    >
                        <i class="fas fa-arrow-left"></i>
                    </button>

                    {#if isLoadingDetail}
                        <div class="hero-placeholder loading-shimmer">
                            <i class="fas fa-spinner fa-spin"></i>
                        </div>
                    {:else if images.length > 0}
                        <!-- svelte-ignore a11y-img-redundant-alt -->
                        <img
                            src={images[currentImageIndex]}
                            alt="Outlet Image"
                            class="hero-image"
                            onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        {#if images.length > 1}
                            <button class="gallery-nav gallery-prev" onclick={prevImage}>
                                <i class="fas fa-chevron-left"></i>
                            </button>
                            <button class="gallery-nav gallery-next" onclick={nextImage}>
                                <i class="fas fa-chevron-right"></i>
                            </button>
                            <div class="gallery-dots">
                                {#each images.slice(0, 5) as _, i}
                                    <button 
                                        class="gallery-dot" 
                                        class:active={i === currentImageIndex}
                                        onclick={() => currentImageIndex = i}
                                    ></button>
                                {/each}
                                {#if images.length > 5}
                                    <span class="gallery-more">+{images.length - 5}</span>
                                {/if}
                            </div>
                        {/if}
                    {:else}
                        <div class="hero-placeholder">
                            <i class="fas fa-store"></i>
                        </div>
                    {/if}

                    <div class="hero-overlay"></div>
                    <div class="hero-brand-logo">
                        {#if activeLogo}
                            <img src={activeLogo} alt={activeBrand?.name} />
                        {:else}
                            <div class="logo-fallback">
                                {activeBrand?.name?.substring(0, 2)}
                            </div>
                        {/if}
                    </div>
                </div>

                <div class="detail-body">
                    <!-- Header -->
                    <div class="detail-header">
                        <h2>{outlet.name}</h2>
                        {#if outlet.subTitle}
                            <p class="detail-subtitle-text">{outlet.subTitle}</p>
                        {/if}
                        <div class="detail-subtitle">
                            {#if outlet.totalScore || outlet.total_score}
                                {@const score = outlet.totalScore || outlet.total_score || 0}
                                <div class="rating-badge">
                                    <i class="fas fa-star"></i>
                                    <span>{score.toFixed(1)}</span>
                                    <span class="review-count">({outlet.reviewsCount || outlet.reviews_count || 0})</span>
                                </div>
                            {/if}
                            <span class="category-pill">{activeBrand?.category || outlet.category_name || "General"}</span>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="action-grid">
                        <button
                            class="action-btn primary"
                            onclick={() => startNavigation($selectedOutlet!)}
                        >
                            <i class="fas fa-directions"></i>
                            <span>Rute</span>
                        </button>
                        {#if getWhatsappLink(outlet)}
                            <a
                                href={getWhatsappLink(outlet)}
                                target="_blank"
                                class="action-btn whatsapp"
                            >
                                <i class="fab fa-whatsapp"></i>
                                <span>Chat</span>
                            </a>
                        {/if}
                        <a
                            href={outlet.googleMapsUrl || (outlet.placeId || outlet.place_id
                                ? `https://www.google.com/maps/place/?q=place_id:${outlet.placeId || outlet.place_id}`
                                : `https://www.google.com/maps/search/?api=1&query=${outlet.latitude},${outlet.longitude}`)}
                            target="_blank"
                            class="action-btn outline"
                        >
                            <i class="fab fa-google"></i>
                            <span>Maps</span>
                        </a>
                        {#if outlet.website}
                            <a
                                href={outlet.website}
                                target="_blank"
                                class="action-btn outline"
                            >
                                <i class="fas fa-globe"></i>
                                <span>Web</span>
                            </a>
                        {/if}
                    </div>

                    <!-- Info Sections -->
                    <div class="info-section">
                        <!-- Address -->
                        <div class="info-row">
                            <i class="fas fa-map-marker-alt"></i>
                            <div>
                                <p>{outlet.address}</p>
                                {#if outlet.neighborhood || outlet.street}
                                    <p class="info-sub">{outlet.neighborhood || ""}{outlet.neighborhood && outlet.street ? ", " : ""}{outlet.street || ""}</p>
                                {/if}
                                {#if outlet.city || outlet.region}
                                    <p class="info-sub">{outlet.city || ""}{outlet.city && outlet.region ? ", " : ""}{outlet.region || ""} {outlet.postalCode || outlet.postal_code || ""}</p>
                                {/if}
                                {#if outlet.plusCode}
                                    <p class="info-sub plus-code"><i class="fas fa-hashtag"></i> {outlet.plusCode}</p>
                                {/if}
                            </div>
                        </div>

                        <!-- Phone -->
                        {#if outlet.phone}
                            <div class="info-row clickable">
                                <i class="fas fa-phone"></i>
                                <a href="tel:{outlet.phoneUnformatted || outlet.phone}">{outlet.phone}</a>
                            </div>
                        {/if}

                        <!-- Website -->
                        {#if outlet.website}
                            <div class="info-row clickable">
                                <i class="fas fa-globe"></i>
                                <a href={outlet.website} target="_blank">{outlet.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>
                            </div>
                        {/if}

                        <!-- Categories -->
                        {#if outlet.categories && outlet.categories.length > 0}
                            <div class="info-row">
                                <i class="fas fa-tags"></i>
                                <div class="tags-cloud inline">
                                    {#each outlet.categories as cat}
                                        <span class="tag cat">{cat}</span>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        <!-- Opening Hours -->
                        {#if outlet.openingHours && outlet.openingHours.length > 0}
                            <div class="detail-card">
                                <div class="card-title"><i class="fas fa-clock"></i> Jam Operasional</div>
                                <div class="hours-grid">
                                    {#each outlet.openingHours as day}
                                        <div class="hours-day">
                                            <span class="day-name">{day.day?.substring(0, 3)}</span>
                                            <span class="day-time">{day.hours}</span>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        <!-- Service Options / Additional Info -->
                        {#if outlet.additionalInfo}
                            {#each Object.entries(outlet.additionalInfo) as [sectionName, items]}
                                {#if Array.isArray(items) && items.length > 0}
                                    <div class="detail-card">
                                        <div class="card-title"><i class="fas fa-concierge-bell"></i> {sectionName}</div>
                                        <div class="service-grid">
                                            {#each items as option}
                                                {#each Object.entries(option) as [key, val]}
                                                    <div class="service-item" class:available={val} class:unavailable={!val}>
                                                        <i class="fas fa-{val ? 'check-circle' : 'times-circle'}"></i>
                                                        <span>{key}</span>
                                                    </div>
                                                {/each}
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            {/each}
                        {/if}

                        <!-- Review Tags -->
                        {#if outlet.reviewsTags && outlet.reviewsTags.length > 0}
                            <div class="detail-card">
                                <div class="card-title"><i class="fas fa-comment-dots"></i> Kata Kunci Review</div>
                                <div class="tags-cloud">
                                    {#each outlet.reviewsTags.slice(0, 12) as tag}
                                        <span class="tag review">{tag.title} <strong>({tag.count})</strong></span>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        <!-- People Also Search -->
                        {#if outlet.peopleAlsoSearch && outlet.peopleAlsoSearch.length > 0}
                            <div class="detail-card">
                                <div class="card-title"><i class="fas fa-search"></i> Orang Juga Mencari</div>
                                <div class="tags-cloud">
                                    {#each outlet.peopleAlsoSearch.slice(0, 8) as item}
                                        <span class="tag search-tag">{item.title}</span>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        <!-- Booking Links -->
                        {#if outlet.bookingLinks && outlet.bookingLinks.length > 0}
                            <div class="detail-card">
                                <div class="card-title"><i class="fas fa-link"></i> Link Booking</div>
                                <div class="booking-links">
                                    {#each outlet.bookingLinks as link}
                                        <a href={link.url} target="_blank" class="booking-link">
                                            <i class="fas fa-external-link-alt"></i>
                                            <span>{link.name || new URL(link.url).hostname}</span>
                                        </a>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        <!-- Meta Info -->
                        <div class="detail-card meta-card">
                            <div class="meta-grid">
                                {#if outlet.imagesCount}
                                    <div class="meta-item">
                                        <i class="fas fa-images"></i>
                                        <span>{outlet.imagesCount} foto</span>
                                    </div>
                                {/if}
                                {#if outlet.placeId || outlet.place_id}
                                    <div class="meta-item">
                                        <i class="fas fa-fingerprint"></i>
                                        <span title={outlet.placeId || outlet.place_id}>Place ID</span>
                                    </div>
                                {/if}
                                {#if outlet.scrapedAt}
                                    <div class="meta-item">
                                        <i class="fas fa-calendar-check"></i>
                                        <span>Data: {new Date(outlet.scrapedAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                                    </div>
                                {/if}
                                <div class="meta-item">
                                    <i class="fas fa-map-pin"></i>
                                    <span>{outlet.latitude?.toFixed(5)}, {outlet.longitude?.toFixed(5)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        {:else}
            <!-- DEFAULT SEARCH & LIST VIEW -->
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
                                        {brand.name
                                            .substring(0, 2)
                                            .toUpperCase()}
                                    </div>
                                {/if}
                            </div>

                            <div class="brand-details">
                                <div class="brand-name">{brand.name}</div>
                                <div
                                    class="brand-meta"
                                    style="font-size: 0.7rem; color: var(--text-muted);"
                                >
                                    {brand.category || "Uncategorized"} • {count}
                                    outlet
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
                    Klik marker untuk melihat detail lokasi. Gunakan scroll
                    untuk zoom peta.
                </p>
            </div>
        {/if}
    </div>
</aside>

<style>
    /* ========================================
       Detail View - Modern Design
       ======================================== */
    .detail-view {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--bg-card);
        overflow-y: auto;
        scroll-behavior: smooth;
    }

    .detail-view::-webkit-scrollbar {
        width: 4px;
    }
    .detail-view::-webkit-scrollbar-thumb {
        background: var(--accent-primary);
        border-radius: 4px;
    }

    /* Hero Section */
    .detail-hero {
        position: relative;
        height: 220px;
        background: #1a1a2e;
        flex-shrink: 0;
        overflow: hidden;
    }

    .hero-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: opacity 0.3s ease;
    }

    .hero-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3rem;
        color: #4a5568;
        background: linear-gradient(135deg, #1a1a2e, #16213e);
    }

    .loading-shimmer {
        background: linear-gradient(90deg, #1a1a2e 25%, #2a2a4e 50%, #1a1a2e 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s ease-in-out infinite;
    }

    @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
    }

    .hero-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 100px;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
        pointer-events: none;
    }

    .btn-back {
        position: absolute;
        top: 16px;
        left: 16px;
        width: 38px;
        height: 38px;
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 10;
        color: white;
        font-size: 0.9rem;
        transition: all 0.2s ease;
    }

    .btn-back:hover {
        background: rgba(0, 0, 0, 0.6);
        transform: scale(1.05);
    }

    /* Gallery Navigation */
    .gallery-nav {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 10;
        font-size: 0.75rem;
        transition: all 0.2s ease;
    }

    .gallery-nav:hover {
        background: rgba(0, 0, 0, 0.7);
        transform: translateY(-50%) scale(1.1);
    }

    .gallery-prev { left: 12px; }
    .gallery-next { right: 12px; }

    .gallery-dots {
        position: absolute;
        bottom: 14px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 6px;
        z-index: 10;
        background: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(8px);
        padding: 4px 10px;
        border-radius: 20px;
    }

    .gallery-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        border: none;
        background: rgba(255, 255, 255, 0.4);
        cursor: pointer;
        transition: all 0.2s ease;
        padding: 0;
    }

    .gallery-dot.active {
        background: white;
        transform: scale(1.3);
    }

    .gallery-more {
        font-size: 0.65rem;
        color: rgba(255, 255, 255, 0.7);
        font-weight: 500;
    }

    .hero-brand-logo {
        position: absolute;
        bottom: -20px;
        right: 20px;
        width: 56px;
        height: 56px;
        background: var(--bg-card);
        border-radius: 14px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        padding: 3px;
        z-index: 5;
        border: 2px solid var(--border-color);
    }

    .hero-brand-logo img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: 10px;
    }

    .logo-fallback {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--accent-primary);
        background: rgba(139, 92, 246, 0.1);
        border-radius: 10px;
    }

    /* Detail Body */
    .detail-body {
        padding: 28px 20px 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .detail-header {
        padding-right: 50px;
    }

    .detail-header h2 {
        font-size: 1.2rem;
        font-weight: 700;
        margin: 0 0 4px 0;
        color: var(--text-primary);
        line-height: 1.3;
    }

    .detail-subtitle-text {
        font-size: 0.8rem;
        color: var(--text-muted);
        margin: 0 0 8px 0;
    }

    .detail-subtitle {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }

    .rating-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: linear-gradient(135deg, #fef3c7, #fde68a);
        padding: 3px 10px;
        border-radius: 8px;
        color: #92400e;
        font-weight: 700;
        font-size: 0.85rem;
    }

    .rating-badge i {
        color: #f59e0b;
        font-size: 0.75rem;
    }

    .review-count {
        font-weight: 400;
        font-size: 0.75rem;
        color: #b45309;
    }

    .category-pill {
        font-size: 0.75rem;
        padding: 3px 10px;
        background: rgba(139, 92, 246, 0.1);
        color: var(--accent-primary);
        border-radius: 8px;
        font-weight: 500;
    }

    /* Detail Cards */
    .detail-card {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 14px;
        padding: 16px;
        transition: border-color 0.2s;
    }

    .detail-card:hover {
        border-color: var(--accent-primary);
    }

    .card-title {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-secondary);
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }

    .card-title i {
        color: var(--accent-primary);
        font-size: 0.85rem;
    }

    /* Action Grid */
    .action-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
        gap: 8px;
    }

    .action-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 12px 8px;
        border-radius: 12px;
        border: none;
        font-size: 0.7rem;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
        transition: all 0.2s ease;
    }

    .action-btn:active { transform: scale(0.96); }

    .action-btn.primary {
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }

    .action-btn.whatsapp {
        background: linear-gradient(135deg, #22c55e, #16a34a);
        color: white;
        box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
    }

    .action-btn.outline {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
    }

    .action-btn.outline:hover {
        border-color: var(--accent-primary);
        background: rgba(139, 92, 246, 0.05);
    }

    .action-btn i {
        font-size: 1.15rem;
    }

    /* Info Section */
    .info-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .info-row {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        color: var(--text-secondary);
        font-size: 0.85rem;
        line-height: 1.5;
    }

    .info-row > i {
        margin-top: 3px;
        width: 16px;
        text-align: center;
        color: var(--accent-primary);
        flex-shrink: 0;
        font-size: 0.85rem;
    }

    .info-row p {
        margin: 0;
    }

    .info-sub {
        font-size: 0.78rem;
        color: var(--text-muted);
        margin-top: 2px;
    }

    .plus-code {
        display: flex;
        align-items: center;
        gap: 4px;
        font-family: 'Courier New', monospace;
        font-size: 0.72rem;
    }

    .plus-code i {
        font-size: 0.6rem;
    }

    .info-row.clickable a {
        color: var(--accent-primary);
        text-decoration: none;
        word-break: break-all;
        transition: color 0.2s;
    }

    .info-row.clickable a:hover {
        text-decoration: underline;
    }

    /* Tags */
    .tags-cloud {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .tags-cloud.inline {
        margin-top: 0;
    }

    .tag {
        font-size: 0.72rem;
        padding: 4px 10px;
        border-radius: 20px;
        font-weight: 500;
        transition: all 0.2s;
    }

    .tag.cat {
        background: rgba(139, 92, 246, 0.1);
        color: var(--accent-primary);
        border: 1px solid rgba(139, 92, 246, 0.2);
    }

    .tag.review {
        background: var(--bg-card);
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
    }

    .tag.review strong {
        color: var(--accent-primary);
        font-weight: 600;
    }

    .tag.search-tag {
        background: rgba(6, 182, 212, 0.08);
        color: var(--accent-secondary);
        border: 1px solid rgba(6, 182, 212, 0.2);
    }

    /* Hours Grid */
    .hours-grid {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .hours-day {
        display: flex;
        justify-content: space-between;
        font-size: 0.78rem;
        padding: 4px 0;
        border-bottom: 1px dashed var(--border-color);
        color: var(--text-secondary);
    }
    .hours-day:last-child { border-bottom: none; }

    .day-name {
        font-weight: 600;
        color: var(--text-primary);
        width: 36px;
    }

    .day-time {
        text-align: right;
    }

    /* Service Grid */
    .service-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
    }

    .service-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.75rem;
        padding: 4px 0;
    }

    .service-item.available {
        color: #16a34a;
    }

    .service-item.available i {
        color: #22c55e;
    }

    .service-item.unavailable {
        color: var(--text-muted);
        opacity: 0.5;
    }

    .service-item.unavailable i {
        color: #ef4444;
    }

    /* Booking Links */
    .booking-links {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .booking-link {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.8rem;
        color: var(--accent-primary);
        text-decoration: none;
        padding: 6px 10px;
        border-radius: 8px;
        background: rgba(139, 92, 246, 0.05);
        transition: all 0.2s;
    }

    .booking-link:hover {
        background: rgba(139, 92, 246, 0.12);
    }

    .booking-link i {
        font-size: 0.7rem;
    }

    /* Meta Card */
    .meta-card {
        background: transparent;
        border-color: transparent;
        padding: 8px 0;
    }

    .meta-card:hover {
        border-color: transparent;
    }

    .meta-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
    }

    .meta-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.7rem;
        color: var(--text-muted);
    }

    .meta-item i {
        font-size: 0.65rem;
        color: var(--text-muted);
    }
</style>
