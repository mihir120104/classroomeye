export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Syne'", "sans-serif"],
        body: ["'DM Sans'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        ink: { 950: "#080B0F", 900: "#0D1117", 800: "#161B22", 700: "#21262D", 600: "#30363D" },
        signal: { green: "#00FF87", amber: "#FFB800", red: "#FF4545", blue: "#3B82F6" },
      },
    },
  },
  plugins: [],
};
