// Tailwind only — no autoprefixer (avoids broken caniuse-lite/browserslist chains on Windows/IIS servers)
export default {
  plugins: {
    tailwindcss: {},
  },
}
