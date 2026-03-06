import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: '0.0.0.0',  // Explicitly bind to all interfaces (IPv4)
    port: 3000,
    strictPort: true,
    hmr: {
      host: '10.0.0.16',  // Your laptop's IP for hot reload
    },
    watch: {
      ignored: ['**/pothole_backend/**', '**/node_modules/**', '**/.git/**'],
    },
    // Proxy API calls to backend - enables mobile access through ngrok
    proxy: {
      '/api': {
        target: 'http://localhost:8766',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

