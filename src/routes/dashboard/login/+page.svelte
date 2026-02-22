<script lang="ts">
    import { goto } from "$app/navigation";
    import { auth } from "$lib/authStore";
    import { onMount } from "svelte";

    let email = $state("");
    let password = $state("");
    let error = $state("");
    let isSubmitting = $state(false);
    let showPassword = $state(false);
    let mounted = $state(false);

    onMount(() => {
        mounted = true;
        // If already authenticated, redirect to dashboard
        const unsub = auth.isAuthenticated.subscribe((v) => {
            if (v) goto("/dashboard");
        });
        return unsub;
    });

    async function handleLogin(e: Event) {
        e.preventDefault();
        error = "";
        isSubmitting = true;

        // Simulate network delay for UX
        await new Promise((r) => setTimeout(r, 800));

        const result = auth.login(email, password);
        if (result.success) {
            goto("/dashboard");
        } else {
            error = result.error || "Login gagal";
            isSubmitting = false;
        }
    }
</script>

<svelte:head>
    <title>Login — Dashboard Admin</title>
</svelte:head>

<div class="login-page" class:mounted>
    <!-- Animated background -->
    <div class="login-bg">
        <div class="bg-orb bg-orb-1"></div>
        <div class="bg-orb bg-orb-2"></div>
        <div class="bg-orb bg-orb-3"></div>
        <div class="bg-grid"></div>
    </div>

    <div class="login-container">
        <!-- Brand Header -->
        <div class="login-brand">
            <div class="login-logo">
                <i class="fas fa-map-marked-alt"></i>
            </div>
            <h1 class="login-title">Start Franchise</h1>
            <p class="login-subtitle">Brand Map Management Portal</p>
        </div>

        <!-- Login Card -->
        <form class="login-card" onsubmit={handleLogin}>
            <div class="card-header">
                <h2>Selamat Datang</h2>
                <p>Masuk ke dashboard admin</p>
            </div>

            {#if error}
                <div class="login-error">
                    <i class="fas fa-exclamation-circle"></i>
                    <span>{error}</span>
                </div>
            {/if}

            <div class="form-group">
                <label for="email">
                    <i class="fas fa-envelope"></i>
                    Email
                </label>
                <input
                    id="email"
                    type="email"
                    bind:value={email}
                    placeholder="admin@example.com"
                    required
                    autocomplete="email"
                />
            </div>

            <div class="form-group">
                <label for="password">
                    <i class="fas fa-lock"></i>
                    Password
                </label>
                <div class="password-wrapper">
                    <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        bind:value={password}
                        placeholder="••••••••••"
                        required
                        autocomplete="current-password"
                    />
                    <button
                        type="button"
                        class="password-toggle"
                        onclick={() => (showPassword = !showPassword)}
                        aria-label="Toggle password visibility"
                    >
                        <i
                            class="fas {showPassword
                                ? 'fa-eye-slash'
                                : 'fa-eye'}"
                        ></i>
                    </button>
                </div>
            </div>

            <button type="submit" class="login-btn" disabled={isSubmitting}>
                {#if isSubmitting}
                    <div class="btn-spinner"></div>
                    <span>Memproses...</span>
                {:else}
                    <i class="fas fa-sign-in-alt"></i>
                    <span>Masuk</span>
                {/if}
            </button>

            <div class="login-footer">
                <p>© 2026 Start Franchise Indonesia</p>
            </div>
        </form>
    </div>
</div>

<style>
    .login-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
        background: var(--bg-primary);
    }

    /* Animated Background */
    .login-bg {
        position: absolute;
        inset: 0;
        overflow: hidden;
    }

    .bg-orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(80px);
        opacity: 0.4;
        animation: float 8s ease-in-out infinite;
    }

    .bg-orb-1 {
        width: 400px;
        height: 400px;
        background: var(--accent-primary);
        top: -100px;
        right: -100px;
        animation-delay: 0s;
    }

    .bg-orb-2 {
        width: 350px;
        height: 350px;
        background: var(--accent-secondary, #06b6d4);
        bottom: -80px;
        left: -80px;
        animation-delay: -3s;
    }

    .bg-orb-3 {
        width: 250px;
        height: 250px;
        background: linear-gradient(
            135deg,
            var(--accent-primary),
            var(--accent-secondary, #06b6d4)
        );
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        animation-delay: -5s;
    }

    .bg-grid {
        position: absolute;
        inset: 0;
        background-image: linear-gradient(
                rgba(139, 92, 246, 0.03) 1px,
                transparent 1px
            ),
            linear-gradient(
                90deg,
                rgba(139, 92, 246, 0.03) 1px,
                transparent 1px
            );
        background-size: 60px 60px;
    }

    @keyframes float {
        0%,
        100% {
            transform: translate(0, 0) scale(1);
        }
        25% {
            transform: translate(30px, -30px) scale(1.05);
        }
        50% {
            transform: translate(-20px, 20px) scale(0.95);
        }
        75% {
            transform: translate(20px, 10px) scale(1.02);
        }
    }

    /* Container */
    .login-container {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 32px;
        width: 100%;
        max-width: 440px;
        padding: 24px;
        opacity: 0;
        transform: translateY(30px);
        transition: all 0.8s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .login-page.mounted .login-container {
        opacity: 1;
        transform: translateY(0);
    }

    /* Brand */
    .login-brand {
        text-align: center;
    }

    .login-logo {
        width: 72px;
        height: 72px;
        border-radius: 20px;
        background: var(--accent-gradient);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.8rem;
        color: white;
        margin: 0 auto 16px;
        box-shadow: 0 8px 32px rgba(139, 92, 246, 0.35);
        animation: pulse-glow 3s ease-in-out infinite;
    }

    @keyframes pulse-glow {
        0%,
        100% {
            box-shadow: 0 8px 32px rgba(139, 92, 246, 0.35);
        }
        50% {
            box-shadow: 0 8px 48px rgba(139, 92, 246, 0.55);
        }
    }

    .login-title {
        font-size: 1.8rem;
        font-weight: 800;
        background: var(--accent-gradient);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-bottom: 4px;
    }

    .login-subtitle {
        font-size: 0.85rem;
        color: var(--text-muted);
        font-weight: 500;
        letter-spacing: 1px;
        text-transform: uppercase;
    }

    /* Card */
    .login-card {
        width: 100%;
        background: var(--bg-glass);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid var(--border-color);
        border-radius: 24px;
        padding: 36px 32px;
        box-shadow: var(--shadow-soft), var(--shadow-glow);
    }

    .card-header {
        margin-bottom: 28px;
    }

    .card-header h2 {
        font-size: 1.4rem;
        font-weight: 700;
        color: var(--text-primary);
        margin-bottom: 4px;
    }

    .card-header p {
        font-size: 0.85rem;
        color: var(--text-muted);
    }

    /* Error */
    .login-error {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        background: rgba(239, 68, 68, 0.12);
        border: 1px solid rgba(239, 68, 68, 0.25);
        border-radius: 12px;
        color: #f87171;
        font-size: 0.85rem;
        font-weight: 500;
        margin-bottom: 20px;
        animation: shake 0.5s ease-in-out;
    }

    @keyframes shake {
        0%,
        100% {
            transform: translateX(0);
        }
        20% {
            transform: translateX(-6px);
        }
        40% {
            transform: translateX(6px);
        }
        60% {
            transform: translateX(-4px);
        }
        80% {
            transform: translateX(4px);
        }
    }

    /* Form */
    .form-group {
        margin-bottom: 20px;
    }

    .form-group label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--text-secondary);
        margin-bottom: 8px;
    }

    .form-group label i {
        color: var(--accent-primary);
        font-size: 0.75rem;
    }

    .form-group input {
        width: 100%;
        padding: 14px 16px;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 14px;
        color: var(--text-primary);
        font-size: 0.95rem;
        font-family: inherit;
        transition: all 0.25s ease;
    }

    .form-group input:focus {
        outline: none;
        border-color: var(--accent-primary);
        box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
        background: var(--bg-secondary);
    }

    .form-group input::placeholder {
        color: var(--text-muted);
    }

    .password-wrapper {
        position: relative;
    }

    .password-wrapper input {
        padding-right: 48px;
    }

    .password-toggle {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .password-toggle:hover {
        background: var(--bg-secondary);
        color: var(--accent-primary);
    }

    /* Submit Button */
    .login-btn {
        width: 100%;
        padding: 16px;
        background: var(--accent-gradient);
        border: none;
        border-radius: 14px;
        color: white;
        font-size: 1rem;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transition: all 0.3s ease;
        margin-top: 8px;
        box-shadow: 0 4px 20px rgba(139, 92, 246, 0.3);
    }

    .login-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 8px 32px rgba(139, 92, 246, 0.45);
    }

    .login-btn:active:not(:disabled) {
        transform: translateY(0);
    }

    .login-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    .btn-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* Footer */
    .login-footer {
        text-align: center;
        margin-top: 24px;
        padding-top: 20px;
        border-top: 1px solid var(--border-color);
    }

    .login-footer p {
        font-size: 0.75rem;
        color: var(--text-muted);
    }

    /* Responsive */
    @media (max-width: 480px) {
        .login-container {
            padding: 16px;
        }

        .login-card {
            padding: 28px 20px;
        }

        .login-title {
            font-size: 1.5rem;
        }
    }
</style>
