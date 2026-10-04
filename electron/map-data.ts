import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// First-run map data download (CLAUDE.md "Installation and distribution").
// Artefacts are published as a separate GitHub release, versioned apart from
// the app. Every part and every finished file is checked against SHA-256 from
// manifest.json before it is used.
export const MAP_DATA_RELEASE = "map-data-v1.0.0";
const RELEASE_BASE_URL = `https://github.com/Steel-Horse-Simulations/bus-game/releases/download/${MAP_DATA_RELEASE}/`;
const PART_ATTEMPTS = 3;

interface Part {
  file: string;
  size: number;
  sha256: string;
}

interface Artefact {
  path: string;
  size: number;
  sha256: string;
  parts: Part[];
}

interface Manifest {
  dataVersion: string;
  artefacts: Artefact[];
}

export function mapDataDir(): string {
  return path.join(app.getPath("userData"), "map-data");
}

function installedFilePath(): string {
  return path.join(mapDataDir(), "installed.json");
}

function readInstalled(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(installedFilePath(), "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeInstalled(installed: Record<string, string>): void {
  fs.mkdirSync(mapDataDir(), { recursive: true });
  fs.writeFileSync(installedFilePath(), JSON.stringify(installed, null, 2));
}

async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(RELEASE_BASE_URL + "manifest.json");
  if (!res.ok) throw new Error(`manifest download failed (${res.status})`);
  return (await res.json()) as Manifest;
}

// Streams one part from the release into `handle` (already positioned at the
// end of the file being built), hashing it on the way through. Retries the
// whole part if the connection drops or the hash does not match.
async function downloadPart(
  part: Part,
  handle: fs.promises.FileHandle,
  start: number,
  onBytes: (n: number) => void,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt++) {
    const hash = crypto.createHash("sha256");
    let written = 0;
    try {
      const res = await fetch(RELEASE_BASE_URL + part.file);
      if (!res.ok || !res.body) throw new Error(`${part.file} download failed (${res.status})`);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await handle.write(value, 0, value.length, start + written);
        hash.update(value);
        written += value.length;
        onBytes(value.length);
      }
      if (written !== part.size || hash.digest("hex") !== part.sha256) {
        throw new Error(`${part.file} failed verification`);
      }
      return;
    } catch (err) {
      lastError = err;
      onBytes(-written);
      await handle.truncate(start);
    }
  }
  throw lastError;
}

async function sha256OfFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

// Brings the local map-data folder up to date with the published manifest.
// Files already present and matching are skipped, so a second run only
// fetches what changed. Reports progress as (label, fraction 0..1).
export async function ensureMapData(onProgress: (label: string, fraction: number) => void): Promise<void> {
  const manifest = await fetchManifest();
  const installed = readInstalled();
  const dir = mapDataDir();

  const pending = manifest.artefacts.filter((a) => {
    const dest = path.join(dir, a.path);
    return !(installed[a.path] === a.sha256 && fs.existsSync(dest));
  });
  const totalBytes = pending.reduce((sum, a) => sum + a.size, 0);
  let doneBytes = 0;

  for (const artefact of pending) {
    const dest = path.join(dir, artefact.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + ".download";
    const handle = await fs.promises.open(tmp, "w");
    try {
      for (const part of artefact.parts) {
        const start = (await handle.stat()).size;
        await downloadPart(part, handle, start, (n) => {
          doneBytes += n;
          if (totalBytes > 0) {
            onProgress(`Downloading map data… ${artefact.path}`, Math.min(1, doneBytes / totalBytes));
          }
        });
      }
    } finally {
      await handle.close();
    }
    if ((await fs.promises.stat(tmp)).size !== artefact.size || (await sha256OfFile(tmp)) !== artefact.sha256) {
      fs.rmSync(tmp, { force: true });
      throw new Error(`${artefact.path} failed verification after download`);
    }
    fs.renameSync(tmp, dest);
    installed[artefact.path] = artefact.sha256;
    writeInstalled(installed);
  }

  onProgress("Map data ready", 1);
}
