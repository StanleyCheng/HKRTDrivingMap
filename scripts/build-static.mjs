// Opt-in static export build for GitHub Pages. Dynamic route handlers under
// app/api are incompatible with `next build` when output: 'export', so they
// are moved aside for the duration of the build and always restored.
// Copy+delete is used instead of rename because OneDrive on Windows denies
// directory renames (EPERM).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "app", "api");
const backupDir = path.join(root, `.api-backup-${process.pid}`);
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

let apiMovedAside = false;
function restoreApi() {
  if (!apiMovedAside) return;
  apiMovedAside = false;
  fs.cpSync(backupDir, apiDir, { recursive: true });
  fs.rmSync(backupDir, { recursive: true, force: true });
  console.log("[build-static] restored app/api");
}

process.on("exit", restoreApi);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restoreApi();
    process.exit(130);
  });
}

try {
  if (fs.existsSync(apiDir)) {
    fs.cpSync(apiDir, backupDir, { recursive: true });
    fs.rmSync(apiDir, { recursive: true });
    apiMovedAside = true;
    console.log("[build-static] moved app/api aside; running next build (STATIC_EXPORT=1)");
  } else {
    console.log("[build-static] no app/api directory; running next build (STATIC_EXPORT=1)");
  }

  const result = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, STATIC_EXPORT: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  restoreApi();
}

if (process.exitCode) throw new Error(`[build-static] next build failed with exit code ${process.exitCode}`);
console.log(`[build-static] static export written to ${path.join(root, "out")}`);
