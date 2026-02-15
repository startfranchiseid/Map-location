<script lang="ts">
    import { onMount } from "svelte";
    import {
        selectedOutlet,
        isNavigating,
        navigationTarget,
        theme,
        brands,
        selectedBrands,
        selectedCategory,
        searchQuery,
        mapAction,
        userLocation,
    } from "$lib/stores";
    import melissaImg from "$lib/assets/melissa_ai.jpg";

    // Chat state
    interface ChatMessage {
        role: "user" | "assistant";
        content: string;
        timestamp: number;
        cached?: boolean;
        provider?: string;
        actions?: AiAction[];
    }

    interface AiAction {
        type:
            | "set_search"
            | "set_category"
            | "set_brand"
            | "clear_filters"
            | "focus_outlet"
            | "open_outlet_detail"
            | "navigate_to_outlet"
            | "highlight_city"
            | "fit_bounds"
            | "reset_view";
        label: string;
        value?: string;
        brandId?: string;
        outletId?: string;
        city?: string;
    }

    let isOpen = false;
    let messages: ChatMessage[] = [];
    let inputText = "";
    let isLoading = false;
    let chatBody: HTMLDivElement;
    let inputEl: HTMLTextAreaElement;

    // Reactive state for positioning
    $: isOutletOpen = !!$selectedOutlet || $isNavigating || !!$navigationTarget;

    // Quick suggestions
    const suggestions = [
        "Cari outlet terdekat",
        "Info brand franchise apa saja?",
        "Rekomendasi franchise pendidikan",
        "Berapa total outlet di Jakarta?",
    ];

    const nearestPattern = /(terdekat|dekat|sekitar|nearest|closest|nearby)/i;

    async function resolveUserLocation(message: string) {
        const currentLoc = $userLocation;
        if (!nearestPattern.test(message)) return currentLoc;
        if (currentLoc) return currentLoc;
        if (!navigator?.geolocation) return null;
        return await new Promise<{ lat: number; lng: number } | null>(
            (resolve) => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const loc = {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                        };
                        userLocation.set(loc);
                        resolve(loc);
                    },
                    () => resolve(null),
                    {
                        enableHighAccuracy: true,
                        maximumAge: 60000,
                        timeout: 8000,
                    },
                );
            },
        );
    }

    function toggleChat() {
        isOpen = !isOpen;
        if (isOpen) {
            setTimeout(() => inputEl?.focus(), 300);
        }
    }

    function scrollToBottom() {
        setTimeout(() => {
            if (chatBody) {
                chatBody.scrollTop = chatBody.scrollHeight;
            }
        }, 50);
    }

    function selectAllBrands() {
        if ($brands.length > 0) {
            selectedBrands.set(new Set($brands.map((b) => b.id)));
        }
    }

    function applyAction(action: AiAction) {
        if (action.type === "set_search") {
            searchQuery.set(action.value || "");
            selectedCategory.set("All");
            selectAllBrands();
            return;
        }
        if (action.type === "set_category") {
            selectedCategory.set(action.value || "All");
            searchQuery.set("");
            selectAllBrands();
            return;
        }
        if (action.type === "set_brand") {
            if (action.brandId) {
                selectedBrands.set(new Set([action.brandId]));
                selectedCategory.set("All");
                searchQuery.set("");
            }
            return;
        }
        if (action.type === "focus_outlet") {
            if (action.outletId) {
                mapAction.set({ type: "focus_outlet", outletId: action.outletId });
            }
            return;
        }
        if (action.type === "open_outlet_detail") {
            if (action.outletId) {
                mapAction.set({
                    type: "open_outlet_detail",
                    outletId: action.outletId,
                });
            }
            return;
        }
        if (action.type === "navigate_to_outlet") {
            if (action.outletId) {
                mapAction.set({
                    type: "navigate_to_outlet",
                    outletId: action.outletId,
                });
            }
            return;
        }
        if (action.type === "highlight_city") {
            if (action.city) {
                searchQuery.set(action.city);
                selectedCategory.set("All");
                selectAllBrands();
                mapAction.set({ type: "highlight_city", city: action.city });
            }
            return;
        }
        if (action.type === "fit_bounds") {
            mapAction.set({ type: "fit_bounds" });
            return;
        }
        if (action.type === "reset_view") {
            mapAction.set({ type: "reset_view" });
            return;
        }
        if (action.type === "clear_filters") {
            searchQuery.set("");
            selectedCategory.set("All");
            selectAllBrands();
        }
    }

    async function sendMessage(text?: string) {
        const msg = (text || inputText).trim();
        if (!msg || isLoading) return;

        // Add user message
        messages = [
            ...messages,
            { role: "user", content: msg, timestamp: Date.now() },
        ];
        inputText = "";
        isLoading = true;
        scrollToBottom();

        try {
            const location = await resolveUserLocation(msg);
            // Build messages payload (last 10 for context window)
            const payload = messages.slice(-10).map((m) => ({
                role: m.role,
                content: m.content,
            }));

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: payload,
                    userLocation: location,
                }),
            });

            const data = await res.json();

            if (data.reply) {
                if (Array.isArray(data.actions)) {
                    data.actions.forEach((action: AiAction) => applyAction(action));
                }
                messages = [
                    ...messages,
                    {
                        role: "assistant",
                        content: data.reply,
                        timestamp: Date.now(),
                        cached: data.cached,
                        provider: data.provider,
                        actions: data.actions,
                    },
                ];
            } else if (data.error) {
                messages = [
                    ...messages,
                    {
                        role: "assistant",
                        content:
                            data.reply ||
                            "Maaf, terjadi kesalahan. Silakan coba lagi.",
                        timestamp: Date.now(),
                    },
                ];
            }
        } catch (err) {
            messages = [
                ...messages,
                {
                    role: "assistant",
                    content:
                        "Maaf, tidak dapat terhubung ke server AI. Pastikan server berjalan dan API key sudah dikonfigurasi.",
                    timestamp: Date.now(),
                },
            ];
        }

        isLoading = false;
        scrollToBottom();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    function formatTime(ts: number): string {
        return new Date(ts).toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    // Simple markdown-ish formatting
    function formatContent(text: string): string {
        return text
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>")
            .replace(/`(.+?)`/g, "<code>$1</code>")
            .replace(/\n/g, "<br>")
            .replace(
                /  - (.+?)(?=<br>|$)/g,
                '<span class="list-item">• $1</span>',
            );
    }
</script>

<!-- Floating Chat Button -->
<button
    class="chat-fab"
    class:open={isOpen}
    class:shifted={isOutletOpen}
    onclick={toggleChat}
    aria-label={isOpen ? "Close Melissa Chat" : "Open Melissa Chat"}
>
    {#if isOpen}
        <i class="fas fa-times"></i>
    {:else}
        <div class="fab-avatar">
            <img src={melissaImg} alt="Melissa" />
        </div>
        <span class="fab-pulse"></span>
    {/if}
</button>

<!-- Chat Panel -->
{#if isOpen}
    <div
        class="chat-panel"
        class:shifted={isOutletOpen}
        class:light-mode={$theme === "light"}
    >
        <!-- Header -->
        <div class="chat-header">
            <div class="chat-header-left">
                <div class="chat-avatar">
                    <img src={melissaImg} alt="Melissa" />
                </div>
                <div>
                    <div class="chat-title">Melissa</div>
                    <div class="chat-subtitle">
                        {#if isLoading}
                            <span class="typing-indicator">
                                <span></span><span></span><span></span>
                            </span>
                            Mengetik...
                        {:else}
                            Asisten Pribadi Start Franchise
                        {/if}
                    </div>
                </div>
            </div>
            <button
                class="chat-minimize"
                onclick={toggleChat}
                aria-label="Minimize chat"
            >
                <i class="fas fa-times"></i>
            </button>
        </div>

        <!-- Messages -->
        <div class="chat-body" bind:this={chatBody}>
            {#if messages.length === 0}
                <!-- Welcome Screen -->
                <div class="welcome-screen">
                    <div class="welcome-avatar">
                        <img src={melissaImg} alt="Melissa" />
                    </div>
                    <h3>Halo, Saya Melissa! 👋</h3>
                    <p>
                        Asisten pribadi Anda untuk menjelajahi peluang franchise
                        di Indonesia. Ada yang bisa saya bantu carikan hari ini?
                    </p>
                    <div class="suggestions">
                        {#each suggestions as suggestion}
                            <button
                                class="suggestion-chip"
                                onclick={() => sendMessage(suggestion)}
                            >
                                {suggestion}
                            </button>
                        {/each}
                    </div>
                </div>
            {:else}
                {#each messages as msg}
                    <div class="message {msg.role}">
                        {#if msg.role === "assistant"}
                            <div class="msg-avatar">
                                <img src={melissaImg} alt="Melissa" />
                            </div>
                        {/if}
                        <div class="msg-bubble">
                            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                            {@html formatContent(msg.content)}
                            {#if msg.actions && msg.actions.length > 0}
                                <div class="msg-actions">
                                    {#each msg.actions as action}
                                        <button
                                            class="action-chip"
                                            onclick={() => applyAction(action)}
                                            disabled={isLoading}
                                        >
                                            {action.label}
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                            <div class="msg-meta">
                                <span>{formatTime(msg.timestamp)}</span>
                            </div>
                        </div>
                    </div>
                {/each}

                {#if isLoading}
                    <div class="message assistant">
                        <div class="msg-avatar">
                            <img src={melissaImg} alt="Melissa" />
                        </div>
                        <div class="msg-bubble loading-bubble">
                            <div class="loading-dots">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>
                {/if}
            {/if}
        </div>

        <!-- Input Area -->
        <div class="chat-footer">
            {#if messages.length > 0}
                <div class="quick-actions">
                    {#each suggestions.slice(0, 2) as suggestion}
                        <button
                            class="quick-chip"
                            onclick={() => sendMessage(suggestion)}
                            disabled={isLoading}
                        >
                            {suggestion}
                        </button>
                    {/each}
                </div>
            {/if}
            <div class="input-row">
                <textarea
                    bind:this={inputEl}
                    bind:value={inputText}
                    onkeydown={handleKeydown}
                    placeholder="Tanya tentang franchise..."
                    rows="1"
                    disabled={isLoading}
                ></textarea>
                <button
                    class="send-btn"
                    onclick={() => sendMessage()}
                    disabled={!inputText.trim() || isLoading}
                    aria-label="Send message"
                >
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    /* ======== Floating Action Button ======== */
    .chat-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #8b5cf6, #6d28d9);
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4rem;
        z-index: 900;
        box-shadow:
            0 4px 20px rgba(139, 92, 246, 0.4),
            0 0 0 3px rgba(139, 92, 246, 0.15);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .chat-fab.shifted {
        right: 420px; /* Shift left when outlet detail is open */
    }

    .fab-avatar {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid rgba(255, 255, 255, 0.2);
    }

    .fab-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .chat-fab:hover {
        transform: scale(1.08);
        box-shadow:
            0 6px 28px rgba(139, 92, 246, 0.5),
            0 0 0 4px rgba(139, 92, 246, 0.2);
    }

    .chat-fab.open {
        opacity: 0;
        pointer-events: none;
        transform: scale(0.8);
    }
    /* Rotate only the icon if we had one, but we have image/X. Let's keep specific behaviour */
    .chat-fab.open i {
        /* The X icon */
    }

    .fab-pulse {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: rgba(139, 92, 246, 0.3);
        animation: fabPulse 2s ease-in-out infinite;
        pointer-events: none;
    }

    @keyframes fabPulse {
        0%,
        100% {
            transform: scale(1);
            opacity: 0.5;
        }
        50% {
            transform: scale(1.3);
            opacity: 0;
        }
    }

    /* ======== Chat Panel ======== */
    .chat-panel {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 380px;
        height: 540px;
        max-height: calc(100vh - 140px);
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(139, 92, 246, 0.2);
        border-radius: 20px;
        z-index: 901;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow:
            0 8px 40px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(139, 92, 246, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        animation: chatSlideUp 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .chat-panel.shifted {
        right: 420px;
    }

    @keyframes chatSlideUp {
        from {
            opacity: 0;
            transform: translateY(20px) scale(0.96);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    /* ======== Header ======== */
    .chat-header {
        padding: 14px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(30, 30, 60, 0.6);
        border-bottom: 1px solid rgba(139, 92, 246, 0.15);
        flex-shrink: 0;
    }

    .chat-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .chat-avatar {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid rgba(139, 92, 246, 0.3);
        flex-shrink: 0;
    }

    .chat-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .chat-title {
        font-size: 0.9rem;
        font-weight: 700;
        color: #f1f5f9;
        letter-spacing: 0.2px;
    }

    .chat-subtitle {
        font-size: 0.7rem;
        color: #94a3b8;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .chat-minimize {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
        color: #94a3b8;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        transition: all 0.2s;
    }

    .chat-minimize:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
    }

    /* ======== Messages Body ======== */
    .chat-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        scroll-behavior: smooth;
    }

    .chat-body::-webkit-scrollbar {
        width: 4px;
    }
    .chat-body::-webkit-scrollbar-thumb {
        background: rgba(139, 92, 246, 0.3);
        border-radius: 4px;
    }

    /* Welcome Screen */
    .welcome-screen {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 20px 10px;
        flex: 1;
    }

    .welcome-avatar {
        width: 80px;
        height: 80px;
        border-radius: 20px;
        overflow: hidden;
        margin-bottom: 16px;
        border: 2px solid rgba(139, 92, 246, 0.3);
        box-shadow: 0 8px 20px rgba(139, 92, 246, 0.2);
    }

    .welcome-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .welcome-screen h3 {
        margin: 0 0 8px;
        font-size: 1.1rem;
        color: #f1f5f9;
        font-weight: 700;
    }

    .welcome-screen p {
        margin: 0 0 20px;
        font-size: 0.8rem;
        color: #94a3b8;
        line-height: 1.5;
        max-width: 280px;
    }

    .suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
    }

    .suggestion-chip {
        padding: 8px 14px;
        border-radius: 20px;
        background: rgba(139, 92, 246, 0.1);
        border: 1px solid rgba(139, 92, 246, 0.25);
        color: #c4b5fd;
        font-size: 0.72rem;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
    }

    .suggestion-chip:hover {
        background: rgba(139, 92, 246, 0.2);
        border-color: rgba(139, 92, 246, 0.4);
        color: white;
        transform: translateY(-1px);
    }

    /* Messages */
    .message {
        display: flex;
        gap: 8px;
        max-width: 92%;
        animation: msgAppear 0.25s ease-out;
    }

    @keyframes msgAppear {
        from {
            opacity: 0;
            transform: translateY(8px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .message.user {
        align-self: flex-end;
        flex-direction: row-reverse;
    }

    .message.assistant {
        align-self: flex-start;
    }

    .msg-avatar {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        overflow: hidden;
        flex-shrink: 0;
        margin-top: 2px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .msg-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .msg-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
    }

    .action-chip {
        padding: 6px 10px;
        border-radius: 12px;
        background: rgba(139, 92, 246, 0.12);
        border: 1px solid rgba(139, 92, 246, 0.25);
        color: #c4b5fd;
        font-size: 0.68rem;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
    }

    .action-chip:hover:not(:disabled) {
        background: rgba(139, 92, 246, 0.2);
        border-color: rgba(139, 92, 246, 0.4);
        color: white;
        transform: translateY(-1px);
    }

    .action-chip:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
    }

    .msg-bubble {
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 0.82rem;
        line-height: 1.55;
        word-break: break-word;
    }

    .message.user .msg-bubble {
        background: linear-gradient(135deg, #7c3aed, #6d28d9);
        color: white;
        border-bottom-right-radius: 4px;
    }

    .message.assistant .msg-bubble {
        background: rgba(30, 41, 59, 0.8);
        color: #e2e8f0;
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-bottom-left-radius: 4px;
    }

    .msg-bubble :global(strong) {
        color: #c4b5fd;
        font-weight: 600;
    }

    .message.user .msg-bubble :global(strong) {
        color: #e9d5ff;
    }

    .msg-bubble :global(code) {
        background: rgba(139, 92, 246, 0.15);
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 0.78rem;
    }

    .msg-bubble :global(.list-item) {
        display: block;
        padding-left: 4px;
        margin: 2px 0;
    }

    .msg-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
        font-size: 0.65rem;
        opacity: 0.5;
    }

    .cache-badge {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
        padding: 1px 6px;
        border-radius: 4px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 3px;
    }

    /* Loading dots */
    .loading-bubble {
        min-width: 60px;
    }

    .loading-dots {
        display: flex;
        gap: 4px;
        align-items: center;
        height: 20px;
    }

    .loading-dots span {
        width: 7px;
        height: 7px;
        background: #8b5cf6;
        border-radius: 50%;
        animation: loadBounce 1.2s ease-in-out infinite;
    }

    .loading-dots span:nth-child(2) {
        animation-delay: 0.15s;
    }
    .loading-dots span:nth-child(3) {
        animation-delay: 0.3s;
    }

    @keyframes loadBounce {
        0%,
        60%,
        100% {
            transform: translateY(0);
            opacity: 0.4;
        }
        30% {
            transform: translateY(-6px);
            opacity: 1;
        }
    }

    /* Typing indicator */
    .typing-indicator {
        display: inline-flex;
        gap: 2px;
        align-items: center;
    }

    .typing-indicator span {
        width: 4px;
        height: 4px;
        background: #8b5cf6;
        border-radius: 50%;
        animation: loadBounce 1.2s ease-in-out infinite;
    }

    .typing-indicator span:nth-child(2) {
        animation-delay: 0.15s;
    }
    .typing-indicator span:nth-child(3) {
        animation-delay: 0.3s;
    }

    /* ======== Footer / Input ======== */
    .chat-footer {
        padding: 10px 14px 14px;
        background: rgba(20, 20, 40, 0.5);
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        flex-shrink: 0;
    }

    .quick-actions {
        display: flex;
        gap: 6px;
        margin-bottom: 8px;
        overflow-x: auto;
        scrollbar-width: none;
    }

    .quick-actions::-webkit-scrollbar {
        display: none;
    }

    .quick-chip {
        padding: 5px 10px;
        border-radius: 14px;
        background: rgba(139, 92, 246, 0.08);
        border: 1px solid rgba(139, 92, 246, 0.15);
        color: #a78bfa;
        font-size: 0.65rem;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .quick-chip:hover:not(:disabled) {
        background: rgba(139, 92, 246, 0.15);
        color: #c4b5fd;
    }

    .quick-chip:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .input-row {
        display: flex;
        gap: 8px;
        align-items: flex-end;
    }

    .input-row textarea {
        flex: 1;
        padding: 10px 14px;
        border-radius: 14px;
        border: 1px solid rgba(139, 92, 246, 0.2);
        background: rgba(30, 30, 55, 0.6);
        color: #f1f5f9;
        font-size: 0.82rem;
        resize: none;
        outline: none;
        font-family: inherit;
        max-height: 80px;
        line-height: 1.4;
        transition: border-color 0.2s;
    }

    .input-row textarea::placeholder {
        color: #64748b;
    }

    .input-row textarea:focus {
        border-color: rgba(139, 92, 246, 0.5);
    }

    .send-btn {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        background: linear-gradient(135deg, #8b5cf6, #6d28d9);
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.85rem;
        transition: all 0.2s;
        flex-shrink: 0;
    }

    .send-btn:hover:not(:disabled) {
        transform: scale(1.05);
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
    }

    .send-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
    }

    /* ======== Responsive ======== */
    @media (max-width: 480px) {
        .chat-panel {
            width: calc(100vw - 16px);
            right: 8px;
            bottom: 80px;
            height: calc(100vh - 120px);
            max-height: none;
            border-radius: 16px;
        }

        .chat-fab {
            bottom: 16px;
            right: 16px;
            width: 50px;
            height: 50px;
            font-size: 1.2rem;
        }
    }

    /* ======== Light Mode Overrides ======== */
    .light-mode.chat-panel {
        background: rgba(255, 255, 255, 0.85); /* Increased transparency */
        border-color: rgba(124, 58, 237, 0.2);
        box-shadow:
            0 8px 40px rgba(0, 0, 0, 0.15),
            0 0 0 1px rgba(124, 58, 237, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.6);
    }

    .light-mode .chat-header {
        background: rgba(255, 255, 255, 0.6);
        border-bottom-color: rgba(124, 58, 237, 0.1);
    }

    .light-mode .chat-title {
        color: #1e293b;
    }
    .light-mode .chat-subtitle {
        color: #64748b;
    }

    .light-mode .chat-minimize {
        background: rgba(0, 0, 0, 0.05);
        color: #64748b;
        border-color: rgba(0, 0, 0, 0.05);
    }
    .light-mode .chat-minimize:hover {
        background: rgba(0, 0, 0, 0.1);
        color: #1e293b;
    }

    .light-mode .welcome-screen h3 {
        color: #1e293b;
    }
    .light-mode .welcome-screen p {
        color: #475569;
    }

    .light-mode .suggestion-chip {
        background: rgba(124, 58, 237, 0.05);
        border-color: rgba(124, 58, 237, 0.2);
        color: #7c3aed;
    }
    .light-mode .suggestion-chip:hover {
        background: rgba(124, 58, 237, 0.1);
    }

    .light-mode .message.assistant .msg-bubble {
        background: #ffffff; /* slate-50 */
        color: #1e293b;
        border-color: #e2e8f0;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }

    .light-mode .msg-bubble :global(strong) {
        color: #7c3aed;
    }
    .light-mode .message.user .msg-bubble :global(strong) {
        color: #e9d5ff;
    } /* Keep user bubble same */

    .light-mode .msg-bubble :global(code) {
        background: #f1f5f9;
        color: #0f172a;
        border: 1px solid #e2e8f0;
    }

    .light-mode .chat-footer {
        background: rgba(255, 255, 255, 0.6);
        border-top-color: rgba(124, 58, 237, 0.1);
    }

    .light-mode .quick-chip {
        background: rgba(124, 58, 237, 0.05);
        border-color: rgba(124, 58, 237, 0.2);
        color: #7c3aed;
    }

    .light-mode .input-row textarea {
        background: #ffffff;
        color: #1e293b;
        border-color: #cbd5e1;
    }
    .light-mode .input-row textarea::placeholder {
        color: #94a3b8;
    }

    .light-mode .chat-body::-webkit-scrollbar-thumb {
        background: rgba(124, 58, 237, 0.2);
    }
</style>
