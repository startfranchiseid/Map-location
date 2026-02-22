<script lang="ts">
	import "../app.css";
	import { theme } from "$lib/stores";
	import { onMount } from "svelte";

	let { children } = $props();

	onMount(() => {
		// Load saved theme
		const savedTheme =
			(localStorage.getItem("brandmap-theme") as "dark" | "light") ||
			"light";
		theme.set(savedTheme);
	});

	// Subscribe to theme changes
	$effect(() => {
		document.documentElement.setAttribute("data-theme", $theme);
		localStorage.setItem("brandmap-theme", $theme);
	});
</script>

<svelte:head>
	<title>Map Start Franchise Indonesia</title>
	<meta
		name="description"
		content="Interactive map of brand locations across Indonesia"
	/>
	<link
		rel="stylesheet"
		href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
	/>
	<link
		rel="stylesheet"
		href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css"
	/>
</svelte:head>

{@render children()}
