import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const apiProxy = process.env.VITE_API_PROXY ?? "http://127.0.0.1:5001";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": apiProxy,
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: true,
  },
});
