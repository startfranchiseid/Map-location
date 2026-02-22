<script lang="ts">
    import { onMount } from "svelte";
    import {
        pb,
        getLogoUrl,
        type Brand,
        type Category,
        getCategories,
        createCategory,
    } from "$lib/pocketbase";

    let brands = $state<Brand[]>([]);
    let totalItems = $state(0);
    let loading = $state(true);
    let searchQuery = $state("");
    let selectedCategory = $state("All");
    let categoriesList = $state<Category[]>([]);
    let categories = $state<{ id: string; name: string }[]>([
        { id: "All", name: "All" },
    ]);
    let showNewCategoryInput = $state(false);
    let newCategoryName = $state("");
    let savingCategory = $state(false);

    // Pagination
    let currentPage = $state(1);
    let perPage = 20;
    let totalPages = $state(1);

    // Modal
    let showModal = $state(false);
    let editingBrand = $state<Brand | null>(null);
    let formData = $state({
        name: "",
        category: "",
        website: "",
        color: "#8b5cf6",
        icon: "",
    });
    let saving = $state(false);

    // Delete
    let showDeleteConfirm = $state(false);
    let deletingBrand = $state<Brand | null>(null);
    let deleting = $state(false);

    // Toast
    let toast = $state<{ message: string; type: "success" | "error" } | null>(
        null,
    );

    async function refreshCategories() {
        categoriesList = await getCategories();
        categories = [
            { id: "All", name: "All" },
            ...categoriesList
                .map((c) => ({ id: c.id, name: c.name }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        ];
    }

    async function handleAddCategory() {
        if (!newCategoryName.trim()) return;
        savingCategory = true;
        try {
            const created = await createCategory({
                name: newCategoryName.trim(),
                icon: "fa-tag",
                color: "#8b5cf6",
            });
            if (created) {
                await refreshCategories();
                formData.category = created.id;
                showToast(
                    `Kategori "${created.name}" berhasil ditambahkan`,
                    "success",
                );
            }
        } catch (err) {
            showToast("Gagal menambahkan kategori", "error");
        } finally {
            savingCategory = false;
            showNewCategoryInput = false;
            newCategoryName = "";
        }
    }

    onMount(async () => {
        // Fetch categories from collection and first page in parallel
        await Promise.all([refreshCategories(), loadBrands()]);
    });

    async function loadBrands() {
        loading = true;
        try {
            const filters: string[] = [];

            if (searchQuery.trim()) {
                const q = searchQuery.trim().replace(/'/g, "\\'");
                const categoryMatches = categoriesList
                    .filter((c) =>
                        c.name.toLowerCase().includes(q.toLowerCase()),
                    )
                    .map((c) => c.id);
                if (categoryMatches.length > 0) {
                    const categoryFilters = categoryMatches
                        .map((id) => `category = '${id}'`)
                        .join(" || ");
                    filters.push(`(name ~ '${q}' || ${categoryFilters})`);
                } else {
                    filters.push(`name ~ '${q}'`);
                }
            }
            if (selectedCategory !== "All") {
                filters.push(`category = '${selectedCategory}'`);
            }

            const result = await pb
                .collection("brands")
                .getList(currentPage, perPage, {
                    filter: filters.join(" && "),
                    sort: "name",
                    fields: "id,name,category,website,logo,color,icon,total_outlets,created,updated",
                    expand: "category",
                });

            brands = result.items as unknown as Brand[];
            totalItems = result.totalItems;
            totalPages = result.totalPages;
        } catch (err) {
            console.error("Error loading brands:", err);
            showToast("Gagal memuat data brands", "error");
        } finally {
            loading = false;
        }
    }

    let searchTimeout: any;
    function onSearchInput() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadBrands();
        }, 400);
    }

    function onFilterChange() {
        currentPage = 1;
        loadBrands();
    }

    function goToPage(page: number) {
        if (page < 1 || page > totalPages) return;
        currentPage = page;
        loadBrands();
    }

    function openAddModal() {
        editingBrand = null;
        showNewCategoryInput = false;
        newCategoryName = "";
        formData = {
            name: "",
            category: "",
            website: "",
            color: "#8b5cf6",
            icon: "",
        };
        showModal = true;
    }

    function openEditModal(brand: Brand) {
        editingBrand = brand;
        showNewCategoryInput = false;
        newCategoryName = "";
        formData = {
            name: brand.name,
            category:
                (brand.expand as any)?.category?.id || brand.category || "",
                (brand.expand as any)?.category?.id || brand.category || "",
            website: brand.website || "",
            color: brand.color || "#8b5cf6",
            icon: brand.icon || "",
        };
        showModal = true;
    }

    async function handleSave() {
        if (!formData.name.trim()) return;
        saving = true;
        try {
            const data = {
                name: formData.name,
            category: formData.category,
                website: formData.website,
                color: formData.color,
                icon: formData.icon,
            };

            if (editingBrand) {
                await pb.collection("brands").update(editingBrand.id, data);
                showToast("Brand berhasil diperbarui", "success");
            } else {
                await pb.collection("brands").create(data);
                showToast("Brand berhasil ditambahkan", "success");
            }
            showModal = false;
            await loadBrands();
        } catch (err) {
            console.error("Error saving brand:", err);
            showToast("Gagal menyimpan brand", "error");
        } finally {
            saving = false;
        }
    }

    function confirmDelete(brand: Brand) {
        deletingBrand = brand;
        showDeleteConfirm = true;
    }

    async function handleDelete() {
        if (!deletingBrand) return;
        deleting = true;
        try {
            await pb.collection("brands").delete(deletingBrand.id);
            showToast("Brand berhasil dihapus", "success");
            showDeleteConfirm = false;
            deletingBrand = null;
            await loadBrands();
        } catch (err) {
            console.error("Error deleting brand:", err);
            showToast("Gagal menghapus brand", "error");
        } finally {
            deleting = false;
        }
    }

    function showToast(message: string, type: "success" | "error") {
        toast = { message, type };
        setTimeout(() => (toast = null), 3000);
    }

    function getLogoSrc(brand: Brand): string {
        if (brand.logo) {
            return getLogoUrl(
                pb.collection("brands").collectionIdOrName,
                brand.id,
                brand.logo,
            );
        }
        return "";
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
        <h1>Kelola Brands</h1>
        <p>Kelola semua brand franchise ({totalItems} terdaftar)</p>
    </div>
    <button class="dash-btn-primary" onclick={openAddModal}>
        <i class="fas fa-plus"></i>
        Tambah Brand
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
                    placeholder="Cari brand..."
                    bind:value={searchQuery}
                    oninput={onSearchInput}
                />
            </div>
            <select
                class="dash-filter-select"
                bind:value={selectedCategory}
                onchange={onFilterChange}
            >
                {#each categories as cat}
                    <option value={cat.id}>{cat.name}</option>
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
                    <th>Brand</th>
                    <th>Kategori</th>
                    <th>Website</th>
                    <th>Outlets</th>
                    <th>Warna</th>
                    <th style="width: 100px;">Aksi</th>
                </tr>
            </thead>
            <tbody>
                {#if loading}
                    {#each Array(5) as _}
                        <tr>
                            {#each Array(6) as __}
                                <td
                                    ><div
                                        class="dash-skeleton"
                                        style="height: 20px;"
                                    ></div></td
                                >
                            {/each}
                        </tr>
                    {/each}
                {:else if brands.length === 0}
                    <tr>
                        <td colspan="6">
                            <div class="dash-empty">
                                <i class="fas fa-tags"></i>
                                <h3>Tidak ada brand ditemukan</h3>
                                <p>Coba ubah filter atau tambah brand baru</p>
                            </div>
                        </td>
                    </tr>
                {:else}
                    {#each brands as brand}
                        <tr>
                            <td>
                                <div class="dash-cell-brand">
                                    <div class="dash-cell-logo">
                                        {#if getLogoSrc(brand)}
                                            <img
                                                src={getLogoSrc(brand)}
                                                alt={brand.name}
                                            />
                                        {:else}
                                            <i class="fas fa-store"></i>
                                        {/if}
                                    </div>
                                    <div>
                                        <div class="dash-cell-name">
                                            {brand.name}
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <span class="dash-badge"
                    >{(brand.expand as any)?.category?.name || "-"}</span
                                >
                            </td>
                            <td>
                                {#if brand.website}
                                    <a
                                        href={brand.website}
                                        target="_blank"
                                        rel="noopener"
                                        style="color: var(--accent-primary); text-decoration: none; font-size: 0.82rem;"
                                    >
                                        <i
                                            class="fas fa-external-link-alt"
                                            style="margin-right: 4px;"
                                        ></i>
                                        Link
                                    </a>
                                {:else}
                                    <span style="color: var(--text-muted);"
                                        >-</span
                                    >
                                {/if}
                            </td>
                            <td>
                                <span style="font-weight: 700;"
                                    >{brand.total_outlets || 0}</span
                                >
                            </td>
                            <td>
                                <div
                                    style="display: flex; align-items: center; gap: 8px;"
                                >
                                    <div
                                        style="width: 16px; height: 16px; border-radius: 50%; background: {brand.color ||
                                            '#8b5cf6'}; box-shadow: 0 2px 8px {brand.color ||
                                            '#8b5cf6'}40;"
                                    ></div>
                                    <span
                                        style="font-size: 0.75rem; color: var(--text-muted);"
                                        >{brand.color || "-"}</span
                                    >
                                </div>
                            </td>
                            <td>
                                <div class="dash-actions">
                                    <button
                                        class="dash-action-btn"
                                        onclick={() => openEditModal(brand)}
                                        aria-label="Edit"
                                    >
                                        <i class="fas fa-pen"></i>
                                    </button>
                                    <button
                                        class="dash-action-btn delete"
                                        onclick={() => confirmDelete(brand)}
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
                )} dari {totalItems}
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

<!-- Add/Edit Modal -->
{#if showModal}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="dash-modal-overlay" onclick={() => (showModal = false)}>
        <div class="dash-modal" onclick={(e) => e.stopPropagation()}>
            <div class="dash-modal-header">
                <div class="dash-modal-title">
                    <i class="fas {editingBrand ? 'fa-pen' : 'fa-plus'}"></i>
                    {editingBrand ? "Edit Brand" : "Tambah Brand Baru"}
                </div>
                <button
                    class="dash-modal-close"
                    onclick={() => (showModal = false)}
                >
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="dash-modal-body">
                <div class="dash-form-group">
                    <label>Nama Brand *</label>
                    <input
                        type="text"
                        bind:value={formData.name}
                        placeholder="Nama brand"
                    />
                </div>
                <div class="dash-form-row">
                    <div class="dash-form-group">
                        <label>Kategori</label>
                        {#if showNewCategoryInput}
                            <div
                                style="display: flex; gap: 8px; align-items: center;"
                            >
                                <input
                                    type="text"
                                    bind:value={newCategoryName}
                                    placeholder="Nama kategori baru"
                                    style="flex: 1;"
                                />
                                <button
                                    class="dash-btn dash-btn-sm"
                                    style="background: var(--accent-primary); color: white; border: none; padding: 10px 14px; border-radius: 8px; cursor: pointer; font-size: 0.8rem;"
                                    onclick={handleAddCategory}
                                    disabled={savingCategory ||
                                        !newCategoryName.trim()}
                                >
                                    {savingCategory ? "..." : "Simpan"}
                                </button>
                                <button
                                    class="dash-btn dash-btn-sm"
                                    style="background: transparent; color: var(--text-secondary); border: 1px solid var(--border-color); padding: 10px 14px; border-radius: 8px; cursor: pointer; font-size: 0.8rem;"
                                    onclick={() => {
                                        showNewCategoryInput = false;
                                        newCategoryName = "";
                                    }}
                                >
                                    Batal
                                </button>
                            </div>
                        {:else}
                            <select
                                bind:value={formData.category}
                                onchange={(e) => {
                                    if (
                                        e.currentTarget.value === "__add_new__"
                                    ) {
                                        showNewCategoryInput = true;
                                        formData.category = "";
                                    }
                                }}
                            >
                                <option value="">Pilih kategori...</option>
                                {#each categoriesList as cat}
                                    <option value={cat.id}>{cat.name}</option>
                                {/each}
                                <option value="__add_new__"
                                    >➕ Tambah Baru...</option
                                >
                            </select>
                        {/if}
                    </div>
                    <div class="dash-form-group">
                        <label>Warna</label>
                        <div
                            style="display: flex; gap: 8px; align-items: center;"
                        >
                            <input
                                type="color"
                                bind:value={formData.color}
                                style="width: 44px; height: 38px; padding: 2px; cursor: pointer;"
                            />
                            <input
                                type="text"
                                bind:value={formData.color}
                                style="flex: 1;"
                            />
                        </div>
                    </div>
                </div>
                <div class="dash-form-group">
                    <label>Website</label>
                    <input
                        type="url"
                        bind:value={formData.website}
                        placeholder="https://example.com"
                    />
                </div>
                <div class="dash-form-group">
                    <label>Icon (Font Awesome class)</label>
                    <input
                        type="text"
                        bind:value={formData.icon}
                        placeholder="Contoh: fa-mug-hot"
                    />
                </div>
            </div>
            <div class="dash-modal-footer">
                <button
                    class="dash-btn-secondary"
                    onclick={() => (showModal = false)}>Batal</button
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
                    <h3>Hapus Brand?</h3>
                    <p>
                        Brand <strong>{deletingBrand?.name}</strong> akan dihapus
                        secara permanen. Tindakan ini tidak bisa dibatalkan.
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
