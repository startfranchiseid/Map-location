<script lang="ts">
    import { onMount, tick } from "svelte";
    import { goto } from "$app/navigation";
    import { pb, getBrands, type Brand, type Outlet } from "$lib/pocketbase";
    import { PUBLIC_MAPTILER_KEY } from "$env/static/public";

    let brands = $state<Brand[]>([]);
    let brandMap = $state<Record<string, string>>({});
    let outlets = $state<any[]>([]);
    let totalItems = $state(0);
    let loading = $state(true);

    // Filters
    let searchQuery = $state("");
    let filterBrand = $state("All");
    let filterCity = $state("All");
    let cities = $state<string[]>(["All"]);

    // Pagination
    let currentPage = $state(1);
    let perPage = 20;
    let totalPages = $state(1);

    // Modal
    let showModal = $state(false);
    let editingOutlet = $state<any | null>(null);
    let formData = $state({
        name: "",
        brand: "",
        address: "",
        city: "",
        region: "",
        latitude: "",
        longitude: "",
        phone: "",
        website: "",
    });
    let saving = $state(false);

    // Map picker
    let mapContainer: HTMLDivElement;
    let mapInstance: any = null;
    let mapMarker: any = null;
    let mapLoaded = $state(false);

    // Delete
    let showDeleteConfirm = $state(false);
    let deletingOutlet = $state<any | null>(null);
    let deleting = $state(false);

    // Toast
    let toast = $state<{ message: string; type: "success" | "error" } | null>(
        null,
    );

    onMount(async () => {
        // Parallel fetch: brands + cities + first page of outlets
        const [brandsResult, citiesResult] = await Promise.all([
            getBrands(),
            pb
                .collection("outlets")
                .getFullList({
                    fields: "city",
                    batch: 500,
                    requestKey: "cities-only",
                })
                .catch(() => []),
            loadOutlets(),
        ]);

        brands = brandsResult;
        brandMap = {};
        for (const b of brands) {
            brandMap[b.id] = b.name;
        }

        const uniqueCities = new Set(
            citiesResult.map((o: any) => o.city).filter(Boolean),
        );
        cities = ["All", ...[...uniqueCities].sort()];
    });

    async function loadOutlets() {
        loading = true;
        try {
            const filters: string[] = [];

            if (searchQuery.trim()) {
                const q = searchQuery.trim().replace(/'/g, "\\'");
                filters.push(
                    `(name ~ '${q}' || address ~ '${q}' || city ~ '${q}')`,
                );
            }
            if (filterBrand !== "All") {
                filters.push(`brand = '${filterBrand}'`);
            }
            if (filterCity !== "All") {
                filters.push(`city = '${filterCity.replace(/'/g, "\\'")}'`);
            }

            const result = await pb
                .collection("outlets")
                .getList(currentPage, perPage, {
                    filter: filters.join(" && "),
                    sort: "-created",
                    fields: "id,brand,name,address,city,region,latitude,longitude,phone,website,totalScore,reviewsCount,total_score,reviews_count,imageUrl,imageUrls,image_url,image_urls,placeId,place_id,category_name,created",
                });

            outlets = result.items;
            totalItems = result.totalItems;
            totalPages = result.totalPages;
        } catch (err) {
            console.error("Error loading outlets:", err);
            showToast("Gagal memuat data outlets", "error");
        } finally {
            loading = false;
        }
    }

    let searchTimeout: any;
    function onSearchInput() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadOutlets();
        }, 400);
    }

    function onFilterChange() {
        currentPage = 1;
        loadOutlets();
    }

    function goToPage(page: number) {
        if (page < 1 || page > totalPages) return;
        currentPage = page;
        loadOutlets();
    }

    function getBrandName(brandId: string): string {
        return brandMap[brandId] || brandId;
    }

    function getScore(outlet: any): number {
        return outlet.totalScore || outlet.total_score || 0;
    }

    function getReviews(outlet: any): number {
        return outlet.reviewsCount || outlet.reviews_count || 0;
    }

    function goToMap(outletId: string) {
        goto(`/?focus=${outletId}`);
    }

    function getOutletImage(outlet: any): string {
        const candidates: string[] = [];
        if (Array.isArray(outlet.imageUrls)) {
            candidates.push(
                ...outlet.imageUrls.filter(
                    (item: string) => item && item.trim() !== "",
                ),
            );
        }
        if (Array.isArray(outlet.image_urls)) {
            candidates.push(
                ...outlet.image_urls.filter(
                    (item: string) => item && item.trim() !== "",
                ),
            );
        }
        if (outlet.imageUrl && outlet.imageUrl.trim() !== "") {
            candidates.push(outlet.imageUrl);
        }
        if (outlet.image_url && outlet.image_url.trim() !== "") {
            candidates.push(outlet.image_url);
        }
        const first = candidates[0];
        if (!first) return "";
        if (first.startsWith("http")) return first;
        return `${pb.baseUrl}/api/files/outlets/${outlet.id}/${first}`;
    }

    async function openAddModal() {
        editingOutlet = null;
        formData = {
            name: "",
            brand: brands[0]?.id || "",
            address: "",
            city: "",
            region: "",
            latitude: "",
            longitude: "",
            phone: "",
            website: "",
        };
        showModal = true;
        await tick();
        initMap(-2.5, 118, 5);
    }

    async function openEditModal(outlet: any) {
        editingOutlet = outlet;
        formData = {
            name: outlet.name || "",
            brand: outlet.brand || "",
            address: outlet.address || "",
            city: outlet.city || "",
            region: outlet.region || "",
            latitude: String(outlet.latitude || ""),
            longitude: String(outlet.longitude || ""),
            phone: outlet.phone || "",
            website: outlet.website || "",
        };
        showModal = true;
        await tick();
        const lat = parseFloat(formData.latitude) || -2.5;
        const lng = parseFloat(formData.longitude) || 118;
        const zoom = formData.latitude ? 15 : 5;
        initMap(lat, lng, zoom);
    }

    async function initMap(lat: number, lng: number, zoom: number) {
        if (!mapContainer) return;
        mapLoaded = false;
        // Dynamically import maplibre-gl
        const maplibregl = await import("maplibre-gl");

        // Destroy existing map
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
            mapMarker = null;
        }

        mapInstance = new maplibregl.Map({
            container: mapContainer,
            style: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${PUBLIC_MAPTILER_KEY}`,
            center: [lng, lat],
            zoom,
        });

        // Add navigation controls
        mapInstance.addControl(new maplibregl.NavigationControl(), "top-right");

        // Add marker if we have coordinates
        if (formData.latitude && formData.longitude) {
            mapMarker = new maplibregl.Marker({
                color: "#8b5cf6",
                draggable: true,
            })
                .setLngLat([
                    parseFloat(formData.longitude),
                    parseFloat(formData.latitude),
                ])
                .addTo(mapInstance);

            mapMarker.on("dragend", () => {
                const lngLat = mapMarker.getLngLat();
                formData.latitude = lngLat.lat.toFixed(7);
                formData.longitude = lngLat.lng.toFixed(7);
            });
        }

        // Click to place marker
        mapInstance.on("click", (e: any) => {
            const { lng: clickLng, lat: clickLat } = e.lngLat;
            formData.latitude = clickLat.toFixed(7);
            formData.longitude = clickLng.toFixed(7);

            if (mapMarker) {
                mapMarker.setLngLat([clickLng, clickLat]);
            } else {
                mapMarker = new maplibregl.Marker({
                    color: "#8b5cf6",
                    draggable: true,
                })
                    .setLngLat([clickLng, clickLat])
                    .addTo(mapInstance);

                mapMarker.on("dragend", () => {
                    const lngLat = mapMarker.getLngLat();
                    formData.latitude = lngLat.lat.toFixed(7);
                    formData.longitude = lngLat.lng.toFixed(7);
                });
            }
        });

        mapInstance.on("load", () => {
            mapLoaded = true;
        });
    }

    function closeModal() {
        showModal = false;
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
            mapMarker = null;
        }
    }

    // Sync manual lat/lng input to marker
    function onCoordsInput() {
        const lat = parseFloat(formData.latitude);
        const lng = parseFloat(formData.longitude);
        if (!isNaN(lat) && !isNaN(lng) && mapInstance) {
            mapInstance.flyTo({ center: [lng, lat], zoom: 15, duration: 1000 });
            if (mapMarker) {
                mapMarker.setLngLat([lng, lat]);
            } else {
                import("maplibre-gl").then((maplibregl) => {
                    mapMarker = new maplibregl.Marker({
                        color: "#8b5cf6",
                        draggable: true,
                    })
                        .setLngLat([lng, lat])
                        .addTo(mapInstance);

                    mapMarker.on("dragend", () => {
                        const lngLat = mapMarker.getLngLat();
                        formData.latitude = lngLat.lat.toFixed(7);
                        formData.longitude = lngLat.lng.toFixed(7);
                    });
                });
            }
        }
    }

    async function handleSave() {
        if (!formData.name.trim() || !formData.brand) return;
        saving = true;
        try {
            const data: any = {
                name: formData.name,
                brand: formData.brand,
                address: formData.address,
                city: formData.city,
                region: formData.region,
                latitude: parseFloat(formData.latitude) || 0,
                longitude: parseFloat(formData.longitude) || 0,
                phone: formData.phone,
                website: formData.website,
            };

            if (editingOutlet) {
                await pb.collection("outlets").update(editingOutlet.id, data);
                showToast("Outlet berhasil diperbarui", "success");
            } else {
                await pb.collection("outlets").create(data);
                showToast("Outlet berhasil ditambahkan", "success");
            }
            closeModal();
            await loadOutlets();
        } catch (err) {
            console.error("Error saving outlet:", err);
            showToast("Gagal menyimpan outlet", "error");
        } finally {
            saving = false;
        }
    }

    function confirmDelete(outlet: any) {
        deletingOutlet = outlet;
        showDeleteConfirm = true;
    }

    async function handleDelete() {
        if (!deletingOutlet) return;
        deleting = true;
        try {
            await pb.collection("outlets").delete(deletingOutlet.id);
            showToast("Outlet berhasil dihapus", "success");
            showDeleteConfirm = false;
            deletingOutlet = null;
            await loadOutlets();
        } catch (err) {
            console.error("Error deleting outlet:", err);
            showToast("Gagal menghapus outlet", "error");
        } finally {
            deleting = false;
        }
    }

    function showToast(message: string, type: "success" | "error") {
        toast = { message, type };
        setTimeout(() => (toast = null), 3000);
    }

    function getPageNumbers(): number[] {
        const pages: number[] = [];
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);
        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }
        return pages;
    }
</script>

<div class="dash-page-header">
    <div class="dash-page-title">
        <h1>Kelola Outlets</h1>
        <p>
            Kelola semua outlet franchise ({totalItems.toLocaleString()} total)
        </p>
    </div>
    <button class="dash-btn-primary" onclick={openAddModal}>
        <i class="fas fa-plus"></i>
        Tambah Outlet
    </button>
</div>

<!-- Search & Filter -->
<div class="dash-card">
    <div class="dash-card-body" style="padding: 16px 24px;">
        <div class="dash-search-bar">
            <div class="dash-search-input">
                <i class="fas fa-search"></i>
                <input
                    type="text"
                    placeholder="Cari outlet..."
                    bind:value={searchQuery}
                    oninput={onSearchInput}
                />
            </div>
            <select
                class="dash-filter-select"
                bind:value={filterBrand}
                onchange={onFilterChange}
            >
                <option value="All">Semua Brand</option>
                {#each brands as brand}
                    <option value={brand.id}>{brand.name}</option>
                {/each}
            </select>
            <select
                class="dash-filter-select"
                bind:value={filterCity}
                onchange={onFilterChange}
            >
                {#each cities as city}
                    <option value={city}
                        >{city === "All" ? "Semua Kota" : city}</option
                    >
                {/each}
            </select>
        </div>
    </div>
</div>

<!-- Table -->
<div class="dash-card" style="margin-top: 16px;">
    <div class="dash-table-wrapper">
        <table class="dash-table">
            <thead>
                <tr>
                    <th>Outlet</th>
                    <th>Brand</th>
                    <th>Kota</th>
                    <th>Rating</th>
                    <th>Review</th>
                    <th>Telepon</th>
                    <th style="width: 100px;">Aksi</th>
                </tr>
            </thead>
            <tbody>
                {#if loading}
                    {#each Array(8) as _}
                        <tr>
                            {#each Array(7) as __}
                                <td
                                    ><div
                                        class="dash-skeleton"
                                        style="height: 20px;"
                                    ></div></td
                                >
                            {/each}
                        </tr>
                    {/each}
                {:else if outlets.length === 0}
                    <tr>
                        <td colspan="7">
                            <div class="dash-empty">
                                <i class="fas fa-map-marker-alt"></i>
                                <h3>Tidak ada outlet ditemukan</h3>
                                <p>Coba ubah filter atau tambah outlet baru</p>
                            </div>
                        </td>
                    </tr>
                {:else}
                    {#each outlets as outlet}
                        <tr>
                            <td>
                                <div
                                    class="dash-cell-brand clickable"
                                    onclick={() => goToMap(outlet.id)}
                                >
                                    <div class="dash-cell-logo">
                                        {#if getOutletImage(outlet)}
                                            <img
                                                src={getOutletImage(outlet)}
                                                alt={outlet.name}
                                            />
                                        {:else}
                                            <i class="fas fa-store"></i>
                                        {/if}
                                    </div>
                                    <div>
                                        <div class="dash-cell-name">
                                            {outlet.name}
                                        </div>
                                        <div
                                            class="dash-cell-sub"
                                            title={outlet.address}
                                        >
                                            {outlet.address?.substring(
                                                0,
                                                40,
                                            )}{outlet.address?.length > 40
                                                ? "..."
                                                : ""}
                                        </div>
                                        {#if outlet.website}
                                            <div class="dash-cell-sub">
                                                {outlet.website}
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            </td>
                            <td>
                                <span class="dash-badge"
                                    >{getBrandName(outlet.brand)}</span
                                >
                            </td>
                            <td style="white-space: nowrap;">
                                <span>{outlet.city || "-"}</span>
                                {#if outlet.region}
                                    <div class="dash-cell-sub">
                                        {outlet.region}
                                    </div>
                                {/if}
                            </td>
                            <td>
                                {#if getScore(outlet) > 0}
                                    <div class="dash-rating">
                                        <i class="fas fa-star"></i>
                                        <span
                                            >{getScore(outlet).toFixed(1)}</span
                                        >
                                    </div>
                                {:else}
                                    <span style="color: var(--text-muted);"
                                        >-</span
                                    >
                                {/if}
                            </td>
                            <td>{getReviews(outlet) || "-"}</td>
                            <td style="font-size: 0.82rem;"
                                >{outlet.phone || "-"}</td
                            >
                            <td>
                                <div class="dash-actions">
                                    <button
                                        class="dash-action-btn"
                                        onclick={() => goToMap(outlet.id)}
                                        aria-label="Maps"
                                    >
                                        <i class="fas fa-map-marked-alt"></i>
                                    </button>
                                    <button
                                        class="dash-action-btn"
                                        onclick={() => openEditModal(outlet)}
                                        aria-label="Edit"
                                    >
                                        <i class="fas fa-pen"></i>
                                    </button>
                                    <button
                                        class="dash-action-btn delete"
                                        onclick={() => confirmDelete(outlet)}
                                        aria-label="Delete"
                                    >
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    {/each}
                {/if}
            </tbody>
        </table>
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
        <div class="dash-pagination">
            <div class="dash-pagination-info">
                Menampilkan {(currentPage - 1) * perPage + 1}-{Math.min(
                    currentPage * perPage,
                    totalItems,
                )} dari {totalItems.toLocaleString()}
            </div>
            <div class="dash-pagination-controls">
                <button
                    class="dash-pagination-btn"
                    onclick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                >
                    <i class="fas fa-chevron-left"></i>
                </button>
                {#each getPageNumbers() as pageNum}
                    <button
                        class="dash-pagination-btn"
                        class:active={pageNum === currentPage}
                        onclick={() => goToPage(pageNum)}
                    >
                        {pageNum}
                    </button>
                {/each}
                <button
                    class="dash-pagination-btn"
                    onclick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                >
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
    {/if}
</div>

<!-- Add/Edit Modal with Map Picker -->
{#if showModal}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="dash-modal-overlay" onclick={closeModal}>
        <div
            class="dash-modal outlet-modal"
            onclick={(e) => e.stopPropagation()}
        >
            <div class="dash-modal-header">
                <div class="dash-modal-title">
                    <i class="fas {editingOutlet ? 'fa-pen' : 'fa-plus'}"></i>
                    {editingOutlet ? "Edit Outlet" : "Tambah Outlet Baru"}
                </div>
                <button class="dash-modal-close" onclick={closeModal}>
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="dash-modal-body">
                <div class="dash-form-group">
                    <label>Nama Outlet *</label>
                    <input
                        type="text"
                        bind:value={formData.name}
                        placeholder="Nama outlet"
                    />
                </div>
                <div class="dash-form-group">
                    <label>Brand *</label>
                    <select bind:value={formData.brand}>
                        <option value="">-- Pilih Brand --</option>
                        {#each brands as brand}
                            <option value={brand.id}>{brand.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="dash-form-group">
                    <label>Alamat</label>
                    <textarea
                        bind:value={formData.address}
                        placeholder="Alamat lengkap outlet"
                    ></textarea>
                </div>
                <div class="dash-form-row">
                    <div class="dash-form-group">
                        <label>Kota</label>
                        <input
                            type="text"
                            bind:value={formData.city}
                            placeholder="Kota"
                        />
                    </div>
                    <div class="dash-form-group">
                        <label>Region</label>
                        <input
                            type="text"
                            bind:value={formData.region}
                            placeholder="Region/Provinsi"
                        />
                    </div>
                </div>

                <!-- Map Picker -->
                <div class="dash-form-group">
                    <label>
                        <i
                            class="fas fa-map-marker-alt"
                            style="color: var(--accent-primary);"
                        ></i>
                        Pilih Lokasi di Peta
                    </label>
                    <p
                        style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 10px;"
                    >
                        Klik peta untuk memilih koordinat, atau drag marker
                        untuk memindahkan
                    </p>
                    <div class="map-picker-container">
                        <div bind:this={mapContainer} class="map-picker"></div>
                        {#if !mapLoaded}
                            <div class="map-picker-loading">
                                <i class="fas fa-spinner fa-spin"></i>
                                <span>Memuat peta...</span>
                            </div>
                        {/if}
                    </div>
                </div>

                <div class="dash-form-row">
                    <div class="dash-form-group">
                        <label>Latitude</label>
                        <input
                            type="number"
                            step="any"
                            bind:value={formData.latitude}
                            placeholder="-6.2088"
                            oninput={onCoordsInput}
                        />
                    </div>
                    <div class="dash-form-group">
                        <label>Longitude</label>
                        <input
                            type="number"
                            step="any"
                            bind:value={formData.longitude}
                            placeholder="106.8456"
                            oninput={onCoordsInput}
                        />
                    </div>
                </div>

                <div class="dash-form-row">
                    <div class="dash-form-group">
                        <label>Telepon</label>
                        <input
                            type="tel"
                            bind:value={formData.phone}
                            placeholder="08xxxxxxxxxx"
                        />
                    </div>
                    <div class="dash-form-group">
                        <label>Website</label>
                        <input
                            type="url"
                            bind:value={formData.website}
                            placeholder="https://"
                        />
                    </div>
                </div>
            </div>
            <div class="dash-modal-footer">
                <button class="dash-btn-secondary" onclick={closeModal}
                    >Batal</button
                >
                <button
                    class="dash-btn-primary"
                    onclick={handleSave}
                    disabled={saving}
                >
                    {#if saving}
                        <i class="fas fa-spinner fa-spin"></i> Menyimpan...
                    {:else}
                        <i class="fas fa-check"></i> Simpan
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Delete Confirm -->
{#if showDeleteConfirm}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="dash-modal-overlay" onclick={() => (showDeleteConfirm = false)}>
        <div
            class="dash-modal"
            style="max-width: 420px;"
            onclick={(e) => e.stopPropagation()}
        >
            <div class="dash-modal-body">
                <div class="dash-confirm-body">
                    <div class="dash-confirm-icon">
                        <i class="fas fa-trash-alt"></i>
                    </div>
                    <h3>Hapus Outlet?</h3>
                    <p>
                        Outlet <strong>{deletingOutlet?.name}</strong> akan dihapus
                        secara permanen.
                    </p>
                </div>
            </div>
            <div class="dash-modal-footer">
                <button
                    class="dash-btn-secondary"
                    onclick={() => (showDeleteConfirm = false)}>Batal</button
                >
                <button
                    class="dash-btn-danger"
                    onclick={handleDelete}
                    disabled={deleting}
                >
                    {#if deleting}
                        <i class="fas fa-spinner fa-spin"></i> Menghapus...
                    {:else}
                        <i class="fas fa-trash"></i> Hapus
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Toast -->
{#if toast}
    <div class="dash-toast {toast.type}">
        <i
            class="fas {toast.type === 'success'
                ? 'fa-check-circle'
                : 'fa-exclamation-circle'}"
        ></i>
        {toast.message}
    </div>
{/if}

<style>
    .outlet-modal {
        max-width: 920px !important;
    }

    .map-picker-container {
        position: relative;
        width: 100%;
        height: 300px;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid var(--border-color);
        background: var(--bg-card);
    }

    .map-picker {
        width: 100%;
        height: 100%;
    }

    .map-picker-loading {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        background: var(--bg-card);
        color: var(--text-muted);
        font-size: 0.85rem;
        z-index: 5;
    }

    .map-picker-loading i {
        color: var(--accent-primary);
        font-size: 1.2rem;
    }

    /* Override MapLibre attribution for dark mode */
    :global(.map-picker .maplibregl-ctrl-attrib) {
        font-size: 10px !important;
        background: rgba(0, 0, 0, 0.5) !important;
        color: #aaa !important;
    }

    :global(.map-picker .maplibregl-ctrl-attrib a) {
        color: #ccc !important;
    }
</style>
