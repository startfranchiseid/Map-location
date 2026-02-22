<script lang="ts">
    import { goto } from "$app/navigation";
    import { auth } from "$lib/authStore";
    import { onMount } from "svelte";
    import { page } from "$app/state";
    import "./dashboard.css";

    let { children } = $props();
    let sidebarCollapsed = $state(false);
    let currentPath = $derived(page.url.pathname);
    let isLoginPage = $derived(currentPath === "/dashboard/login");
    let isAuthed = $state(false);
    let authChecked = $state(false);
    let userName = $state("Admin");
    let userEmail = $state("");
    let isMobileMenuOpen = $state(false);

    onMount(() => {
        const unsub = auth.isAuthenticated.subscribe((v) => {
            isAuthed = v;
            authChecked = true;
            if (!v && !page.url.pathname.includes("/login")) {
                goto("/dashboard/login");
            }
        });
        const unsub2 = auth.adminUser.subscribe((u) => {
            if (u) {
                userName = u.name;
                userEmail = u.email;
            }
        });
        return () => {
            unsub();
            unsub2();
        };
    });

    function handleLogout() {
        auth.logout();
        goto("/dashboard/login");
    }

    const navItems = [
        {
            path: "/dashboard",
            label: "Overview",
            icon: "fa-chart-pie",
            exact: true,
        },
        { path: "/dashboard/brands", label: "Brands", icon: "fa-tags" },
        {
            path: "/dashboard/outlets",
            label: "Outlets",
            icon: "fa-map-marker-alt",
        },
    ];

    function isActive(itemPath: string, exact: boolean = false): boolean {
        if (exact) return currentPath === itemPath;
        return currentPath.startsWith(itemPath);
    }
</script>

<!-- LOGIN PAGE: render standalone without sidebar/topbar -->
{#if isLoginPage}
    {@render children()}
    <!-- DASHBOARD PAGES: require auth, show sidebar/topbar -->
{:else if !authChecked}
    <div class="dash-auth-loading">
        <div class="dash-auth-spinner"></div>
    </div>
{:else if !isAuthed}
    <div class="dash-auth-loading">
        <div class="dash-auth-spinner"></div>
        <p>Redirecting to login...</p>
    </div>
{:else}
    <div class="dash-layout" class:sidebar-collapsed={sidebarCollapsed}>
        <!-- Sidebar -->
        <aside
            class="dash-sidebar"
            class:collapsed={sidebarCollapsed}
            class:mobile-open={isMobileMenuOpen}
        >
            <div class="dash-sidebar-header">
                <div class="dash-sidebar-brand">
                    <div class="dash-brand-icon">
                        <i class="fas fa-map-marked-alt"></i>
                    </div>
                    <div
                        class="dash-brand-text"
                        class:hidden={sidebarCollapsed}
                    >
                        <span class="dash-brand-name">Start Franchise</span>
                        <span class="dash-brand-label">Admin Panel</span>
                    </div>
                </div>
                <button
                    class="dash-sidebar-toggle"
                    onclick={() => (sidebarCollapsed = !sidebarCollapsed)}
                    aria-label="Toggle sidebar"
                >
                    <i
                        class="fas {sidebarCollapsed
                            ? 'fa-angles-right'
                            : 'fa-angles-left'}"
                    ></i>
                </button>
            </div>

            <nav class="dash-nav">
                {#each navItems as item}
                    <a
                        href={item.path}
                        class="dash-nav-item"
                        class:active={isActive(item.path, item.exact)}
                        onclick={() => (isMobileMenuOpen = false)}
                        title={sidebarCollapsed ? item.label : ""}
                    >
                        <i class="fas {item.icon}"></i>
                        <span
                            class="dash-nav-label"
                            class:hidden={sidebarCollapsed}>{item.label}</span
                        >
                    </a>
                {/each}
            </nav>

            <div class="dash-sidebar-footer">
                <a
                    href="/"
                    class="dash-nav-item"
                    target="_blank"
                    title={sidebarCollapsed ? "Lihat Map" : ""}
                >
                    <i class="fas fa-globe"></i>
                    <span class="dash-nav-label" class:hidden={sidebarCollapsed}
                        >Lihat Map</span
                    >
                </a>
            </div>
        </aside>

        <!-- Main -->
        <div class="dash-main">
            <!-- Top Bar -->
            <header class="dash-topbar">
                <div class="dash-topbar-left">
                    <button
                        class="dash-mobile-toggle"
                        onclick={() => (isMobileMenuOpen = !isMobileMenuOpen)}
                        aria-label="Toggle menu"
                    >
                        <i class="fas fa-bars"></i>
                    </button>
                    <div class="dash-breadcrumb">
                        <span class="dash-breadcrumb-home"
                            ><i class="fas fa-home"></i></span
                        >
                        <span class="dash-breadcrumb-sep">/</span>
                        <span class="dash-breadcrumb-current">
                            {#if currentPath === "/dashboard"}
                                Overview
                            {:else if currentPath.includes("brands")}
                                Brands
                            {:else if currentPath.includes("outlets")}
                                Outlets
                            {:else}
                                Dashboard
                            {/if}
                        </span>
                    </div>
                </div>

                <div class="dash-topbar-right">
                    <div class="dash-user-info">
                        <div class="dash-user-avatar">
                            <i class="fas fa-user"></i>
                        </div>
                        <div class="dash-user-details">
                            <span class="dash-user-name">{userName}</span>
                            <span class="dash-user-role">Super Admin</span>
                        </div>
                    </div>
                    <button
                        class="dash-logout-btn"
                        onclick={handleLogout}
                        aria-label="Logout"
                    >
                        <i class="fas fa-sign-out-alt"></i>
                        <span>Logout</span>
                    </button>
                </div>
            </header>

            <!-- Content -->
            <main class="dash-content">
                {@render children()}
            </main>
        </div>
    </div>

    <!-- Mobile overlay -->
    {#if isMobileMenuOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="dash-overlay"
            onclick={() => (isMobileMenuOpen = false)}
        ></div>
    {/if}
{/if}

<style>
    .hidden {
        display: none !important;
    }

    .dash-auth-loading {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        background: var(--bg-primary);
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    .dash-auth-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--bg-card);
        border-top-color: var(--accent-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
