import { defineConfig } from "vite";

// Four pages on one site: the landing page, the stage (/stage), the explorer (/explore) and the phone page (/join).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: "index.html",
        stage: "stage.html",
        explore: "explore.html",
        join: "join.html",
      },
    },
  },
});
