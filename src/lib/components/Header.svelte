<script lang="ts">
    import { theme, stats } from "$lib/stores";

    function toggleTheme() {
        theme.update((t) => {
            const newTheme = t === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", newTheme);
            return newTheme;
        });
    }
</script>

<header class="floating-header">
    <div class="header-left">
        <div class="logo">
            <div class="logo-icon">
                <i class="fas fa-map-location-dot"></i>
            </div>
            <div class="logo-text">
                <span class="logo-title">BrandMap</span>
                <span class="logo-subtitle">Indonesia</span>
            </div>
        </div>
    </div>

    <div class="header-center">
        <div class="stats-container">
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-store"></i></div>
                <div class="stat-content">
                    <span class="stat-value">{$stats.totalOutlets}</span>
                    <span class="stat-label">Outlets</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-building"></i></div>
                <div class="stat-content">
                    <span class="stat-value">{$stats.totalBrands}</span>
                    <span class="stat-label">Brands</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-city"></i></div>
                <div class="stat-content">
                    <span class="stat-value">{$stats.totalCities}</span>
                    <span class="stat-label">Kota</span>
                </div>
            </div>
        </div>
    </div>

    <div class="header-right">
        <button class="theme-toggle" onclick={toggleTheme} title="Toggle Theme">
            {#if $theme === "dark"}
                <i
                    class="fas fa-sun"
                    id="themeIconLight"
                    style="opacity: 1; transform: translate(-50%, -50%);"
                ></i>
            {:else}
                <i
                    class="fas fa-moon"
                    id="themeIconDark"
                    style="opacity: 1; transform: translate(-50%, -50%);"
                ></i>
            {/if}
        </button>
    </div>
</header>
