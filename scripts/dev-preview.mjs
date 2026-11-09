import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { copyFile, cp, mkdir, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startPreviewBackend } from "./dev-preview-backend.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const port = args.length === 0 ? 4310 : args.length === 2 && args[0] === "--port" ? Number(args[1]) : NaN;
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error("Uso: npm run dev:preview [-- --port 4310]");
  process.exit(1);
}
const origin = `http://127.0.0.1:${port}`;
const tempRoot = path.resolve(tmpdir());
const prefix = "limiar-preview-";
const previewRoot = await mkdtemp(path.join(tempRoot, prefix));
let backend;
let child;
const watchers = [];
const pending = new Map();

function watchSource(name) {
  const sourceRoot = path.join(project, name);
  const targetRoot = path.join(previewRoot, name);
  const watcher = watch(sourceRoot, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const relative = path.relative(sourceRoot, path.resolve(sourceRoot, filename));
    if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) return;
    const source = path.join(sourceRoot, relative);
    const target = path.join(targetRoot, relative);
    clearTimeout(pending.get(target));
    pending.set(target, setTimeout(async () => {
      pending.delete(target);
      try {
        const item = await stat(source).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
        if (!item) {
          // relative was checked above; only the copied file/directory is removed.
          await rm(target, { recursive: true, force: true });
        } else if (item.isDirectory()) {
          await cp(source, target, { recursive: true });
        } else {
          await mkdir(path.dirname(target), { recursive: true });
          await copyFile(source, target);
        }
      } catch (error) {
        console.warn(`Falha ao atualizar ${relative} na prévia:`, error.message);
      }
    }, 90));
  });
  watcher.on("error", error => console.warn(`Reinicie a prévia para sincronizar ${name}:`, error.message));
  watchers.push(watcher);
}

const stop = () => child?.kill("SIGINT");
try {
  // Keep .env files out of Next's project root. A copy keeps App Router discovery
  // and HMR inside the sandbox even when Windows resolves a directory junction.
  const junction = process.platform === "win32" ? "junction" : "dir";
  await symlink(path.join(project, "node_modules"), path.join(previewRoot, "node_modules"), junction);
  await Promise.all(["src", "public"].map(name => cp(path.join(project, name), path.join(previewRoot, name), { recursive: true })));
  for (const name of ["src", "public"]) watchSource(name);
  for (const name of ["package.json", "next.config.js", "tsconfig.json", "tailwind.config.ts", "postcss.config.js"]) {
    await copyFile(path.join(project, name), path.join(previewRoot, name));
  }
  backend = await startPreviewBackend(origin);
  const osKeys = /^(?:path|pathext|comspec|systemroot|windir|tmp|temp|tmpdir|home|userprofile|homedrive|homepath|appdata|localappdata|systemdrive|lang|lc_all)$/i;
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => osKeys.test(key)));
  child = spawn(process.execPath, [
    path.join(previewRoot, "node_modules", "next", "dist", "bin", "next"),
    "dev", "--hostname", "127.0.0.1", "--port", String(port),
  ], {
    cwd: previewRoot,
    stdio: "inherit",
    env: {
      ...cleanEnv, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", LIMIAR_PREVIEW: "1",
      NEXT_PUBLIC_SUPABASE_URL: backend.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: backend.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: backend.adminKey, NEXT_PUBLIC_APP_URL: origin,
    },
  });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log(`Prévia do Limiar: ${origin}/dev (dados fictícios; Ctrl+C para sair)`);
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal === "SIGINT" ? 0 : 1)));
  });
} catch (error) {
  console.error("Não foi possível iniciar a prévia:", error.message);
  process.exitCode = 1;
} finally {
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
  for (const watcher of watchers) watcher.close();
  for (const timer of pending.values()) clearTimeout(timer);
  backend?.server.close();
  backend?.server.closeAllConnections();
  const target = path.resolve(previewRoot);
  if (path.dirname(target) === tempRoot && path.basename(target).startsWith(prefix)) {
    try { await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); }
    catch { console.warn("A pasta temporária da prévia ficou disponível em:", target); }
  }
}
