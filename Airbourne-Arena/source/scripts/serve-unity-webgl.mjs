import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const buildRoot = resolve(repositoryRoot, "Builds/WebGL");
const port = Number.parseInt(process.env.AIRBOURNE_WEBGL_PORT ?? "8000", 10);

const types = {
  ".br": "application/octet-stream",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = resolve(buildRoot, relative);
    if (!filePath.startsWith(`${buildRoot}/`) && filePath !== buildRoot) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    const headers = {
      "Cache-Control": "no-store",
      "Content-Type": types[extname(filePath)] ?? "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    };
    if (filePath.endsWith(".br")) {
      headers["Content-Encoding"] = "br";
      if (filePath.endsWith(".js.br")) headers["Content-Type"] = "text/javascript";
      if (filePath.endsWith(".wasm.br")) headers["Content-Type"] = "application/wasm";
    }
    response.writeHead(200, headers).end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`Airbourne Arena Unity WebGL listening on port ${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
