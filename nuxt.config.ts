import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
   app: {
    pageTransition: { name: 'page', mode: 'out-in' },
  },
  css: ['./app/assets/css/main.css'],
  vite: {
    plugins: [
      tailwindcss(),
    ],
  },

  runtimeConfig: {
    // Server-side only (secret)
    anthropicApiKey: process.env.ANTHROPIC_API_KEY
  },
 
  // Global route middleware
  routeRules: {
    '/': { ssr: false },
    '/login': { ssr: false },
  },
});