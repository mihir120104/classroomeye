// frontend/vitest.config.js
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.js"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/components/**", "src/pages/**", "src/hooks/**"],
    },
  },
});