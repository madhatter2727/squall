import { defineConfig } from "vite";
import tropics from "./api/tropics.js";

function tropicsApi() {
  const handle = async (req, res, next) => {
    const path = (req.url || "").split("?")[0];
    if (path !== "/api/tropics") return next();
    try {
      await tropics(req, res);
    } catch {
      if (!res.writableEnded) {
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "NHC unreachable", activeStorms: [] }));
      }
    }
  };
  return {
    name: "squall-tropics",
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}

export default defineConfig({
  plugins: [tropicsApi()],
  build: { outDir: "dist", emptyOutDir: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
