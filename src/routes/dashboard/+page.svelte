<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import {
        pb,
        getBrands,
        type Brand,
        type Outlet,
        getCategories,
    } from "$lib/pocketbase";

    let brands = $state<Brand[]>([]);
    let totalOutlets = $state(0);
    let totalCities = $state(0);
    let totalCategories = $state(0);
    let recentOutlets = $state<any[]>([]);
    let loading = $state(true);
    let brandDistribution = $state<
        { name: string; count: number; color: string }[]
    >([]);

    const colors = [
        "#8b5cf6",
        "#06b6d4",
        "#f59e0b",
        "#10b981",
        "#f43f5e",
        "#3b82f6",
        "#ec4899",
        "#14b8a6",
        "#f97316",
        "#a78bfa",
    ];

    onMount(async () => {
        try {
            // Fetch brands and categories in parallel
            const [brandsData, categoriesData] = await Promise.all([
                getBrands(),
                getCategories(),
            ]);
            brands = brandsData;
            totalCategories = categoriesData.length;

            // Fetch outlets count
            const outletsResult = await pb.collection("outlets").getList(1, 1);
            totalOutlets = outletsResult.totalItems;

            // Fetch recent outlets
            const recent = await pb.collection("outlets").getList(1, 8, {
                sort: "-created",
                fields: "id,name,city,region,created,brand",
            });
            recentOutlets = recent.items;

            // Fetch cities count
            const allOutletsForCities = await pb
                .collection("outlets")
                .getFullList({
                    fields: "city",
                    batch: 500,
                });
            totalCities = new Set(
                allOutletsForCities.map((o: any) => o.city).filter(Boolean),
            ).size;

            // Brand distribution
            brandDistribution = brands
                .filter((b) => (b.total_outlets || 0) > 0)
                .sort((a, b) => (b.total_outlets || 0) - (a.total_outlets || 0))
                .slice(0, 10)
                .map((b, i) => ({
                    name: b.name,
                    count: b.total_outlets || 0,
                    color: colors[i % colors.length],
                }));
        } catch (err) {
            console.error("Error loading dashboard data:", err);
        } finally {
            loading = false;
        }
    });

    function goToMap(outletId: string) {
        goto(`/?focus=${outletId}`);
    }

    function getBrandName(brandId: string): string {
        return brands.find((b) => b.id === brandId)?.name || brandId;
    }

    function formatDate(dateStr: string): string {
        return new Date(dateStr).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    }

    function getMaxCount(): number {
        return Math.max(...brandDistribution.map((b) => b.count), 1);
    }
</script>

<div class="dash-page-header">
    <div class="dash-page-title">
        <h1>Dashboard Overview</h1>
        <p>Selamat datang di panel admin Brand Map Indonesia</p>
    </div>
</div>

<!-- Stats -->
<div class="dash-stats-grid">
    <div class="dash-stat-card">
        <div class="dash-stat-icon purple"><i class="fas fa-tags"></i></div>
        <div class="dash-stat-info">
            {#if loading}
                <div
                    class="dash-skeleton"
                    style="width: 60px; height: 32px; margin-bottom: 4px;"
                ></div>
            {:else}
                <div class="dash-stat-value">{brands.length}</div>
            {/if}
            <div class="dash-stat-label">Total Brands</div>
        </div>
    </div>
    <div class="dash-stat-card">
        <div class="dash-stat-icon cyan">
            <i class="fas fa-map-marker-alt"></i>
        </div>
        <div class="dash-stat-info">
            {#if loading}
                <div
                    class="dash-skeleton"
                    style="width: 60px; height: 32px; margin-bottom: 4px;"
                ></div>
            {:else}
                <div class="dash-stat-value">
                    {totalOutlets.toLocaleString()}
                </div>
            {/if}
            <div class="dash-stat-label">Total Outlets</div>
        </div>
    </div>
    <div class="dash-stat-card">
        <div class="dash-stat-icon amber"><i class="fas fa-city"></i></div>
        <div class="dash-stat-info">
            {#if loading}
                <div
                    class="dash-skeleton"
                    style="width: 60px; height: 32px; margin-bottom: 4px;"
                ></div>
            {:else}
                <div class="dash-stat-value">{totalCities}</div>
            {/if}
            <div class="dash-stat-label">Total Kota</div>
        </div>
    </div>
    <div class="dash-stat-card">
        <div class="dash-stat-icon emerald">
            <i class="fas fa-layer-group"></i>
        </div>
        <div class="dash-stat-info">
            {#if loading}
                <div
                    class="dash-skeleton"
                    style="width: 60px; height: 32px; margin-bottom: 4px;"
                ></div>
            {:else}
                <div class="dash-stat-value">{totalCategories}</div>
            {/if}
            <div class="dash-stat-label">Kategori</div>
        </div>
    </div>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
    <!-- Brand Distribution -->
    <div class="dash-card">
        <div class="dash-card-header">
            <div class="dash-card-title">
                <i class="fas fa-chart-bar"></i>
                Distribusi Outlet per Brand
            </div>
        </div>
        <div class="dash-card-body">
            {#if loading}
                {#each Array(5) as _}
                    <div
                        class="dash-skeleton"
                        style="height: 32px; margin-bottom: 12px;"
                    ></div>
                {/each}
            {:else if brandDistribution.length === 0}
                <div class="dash-empty">
                    <i class="fas fa-chart-bar"></i>
                    <h3>Belum ada data</h3>
                </div>
            {:else}
                <div class="dist-chart">
                    {#each brandDistribution as item}
                        <div class="dist-item">
                            <div class="dist-label">
                                <span class="dist-name">{item.name}</span>
                                <span class="dist-count">{item.count}</span>
                            </div>
                            <div class="dist-bar-bg">
                                <div
                                    class="dist-bar-fill"
                                    style="width: {(item.count /
                                        getMaxCount()) *
                                        100}%; background: {item.color};"
                                ></div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>

    <!-- Recent Activity -->
    <div class="dash-card">
        <div class="dash-card-header">
            <div class="dash-card-title">
                <i class="fas fa-clock"></i>
                Outlet Terbaru
            </div>
        </div>
        <div class="dash-card-body" style="padding: 0;">
            {#if loading}
                <div style="padding: 24px;">
                    {#each Array(5) as _}
                        <div
                            class="dash-skeleton"
                            style="height: 48px; margin-bottom: 12px;"
                        ></div>
                    {/each}
                </div>
            {:else if recentOutlets.length === 0}
                <div class="dash-empty">
                    <i class="fas fa-inbox"></i>
                    <h3>Belum ada outlet</h3>
                </div>
            {:else}
                <div class="recent-list">
                    {#each recentOutlets as outlet}
                        <div
                            class="recent-item"
                            onclick={() => goToMap(outlet.id)}
                        >
                            <div class="recent-icon">
                                <i class="fas fa-store"></i>
                            </div>
                            <div class="recent-info">
                                <span class="recent-name">{outlet.name}</span>
                                <span class="recent-meta"
                                    >{outlet.city || "N/A"} · {getBrandName(
                                        outlet.brand,
                                    )}</span
                                >
                            </div>
                            <span class="recent-date"
                                >{formatDate(outlet.created)}</span
                            >
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>

<!-- Quick Actions -->
<div class="dash-card" style="margin-top: 24px;">
    <div class="dash-card-header">
        <div class="dash-card-title">
            <i class="fas fa-bolt"></i>
            Quick Actions
        </div>
    </div>
    <div class="dash-card-body">
        <div class="dash-quick-actions">
            <a href="/dashboard/brands" class="dash-quick-action">
                <div
                    class="dash-quick-action-icon"
                    style="background: linear-gradient(135deg, #8b5cf6, #a78bfa);"
                >
                    <i class="fas fa-plus"></i>
                </div>
                <div class="dash-quick-action-text">
                    <strong>Tambah Brand</strong>
                    <span>Tambah brand baru ke sistem</span>
                </div>
            </a>
            <a href="/dashboard/outlets" class="dash-quick-action">
                <div
                    class="dash-quick-action-icon"
                    style="background: linear-gradient(135deg, #06b6d4, #22d3ee);"
                >
                    <i class="fas fa-map-pin"></i>
                </div>
                <div class="dash-quick-action-text">
                    <strong>Tambah Outlet</strong>
                    <span>Tambah outlet baru ke peta</span>
                </div>
            </a>
            <a href="/" target="_blank" class="dash-quick-action">
                <div
                    class="dash-quick-action-icon"
                    style="background: linear-gradient(135deg, #10b981, #34d399);"
                >
                    <i class="fas fa-map"></i>
                </div>
                <div class="dash-quick-action-text">
                    <strong>Lihat Peta</strong>
                    <span>Buka peta publik</span>
                </div>
            </a>
        </div>
    </div>
</div>

<style>
    /* Distribution Chart */
    .dist-chart {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .dist-item {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .dist-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .dist-name {
        font-size: 0.82rem;
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 200px;
    }

    .dist-count {
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--text-secondary);
    }

    .dist-bar-bg {
        width: 100%;
        height: 8px;
        background: var(--bg-card);
        border-radius: 4px;
        overflow: hidden;
    }

    .dist-bar-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
    }

    /* Recent List */
    .recent-list {
        display: flex;
        flex-direction: column;
    }

    .recent-item {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 24px;
        border-bottom: 1px solid var(--border-color);
        transition: background 0.15s ease;
        cursor: pointer;
    }

    .recent-item:last-child {
        border-bottom: none;
    }

    .recent-item:hover {
        background: rgba(139, 92, 246, 0.04);
    }

    .recent-icon {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        background: linear-gradient(
            135deg,
            rgba(139, 92, 246, 0.12),
            rgba(6, 182, 212, 0.08)
        );
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--accent-primary);
        font-size: 0.85rem;
        flex-shrink: 0;
    }

    .recent-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .recent-name {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .recent-meta {
        font-size: 0.72rem;
        color: var(--text-muted);
    }

    .recent-date {
        font-size: 0.72rem;
        color: var(--text-muted);
        white-space: nowrap;
    }

    @media (max-width: 1024px) {
        div[style*="grid-template-columns: 1fr 1fr"] {
            display: flex !important;
            flex-direction: column;
        }
    }
</style>
