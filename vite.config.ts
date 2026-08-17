import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.indexOf("node_modules") === -1) return;

          if (id.indexOf("@supabase") !== -1) return "vendor-supabase";
          if (id.indexOf("@headlessui") !== -1 || id.indexOf("@floating-ui") !== -1) return "vendor-headlessui";
          if (id.indexOf("lucide-react") !== -1 || id.indexOf("lucide/dist") !== -1) return "vendor-icons";
          if (id.indexOf("react") !== -1 || id.indexOf("react-router") !== -1 || id.indexOf("scheduler") !== -1) return "vendor-react";
        },
      },
    },
  },
});
