// Checks a packaged map-data folder the way the game's downloader will:
// every part's SHA-256 against the manifest, then reassembles each artefact
// and checks its full SHA-256. Run: node scripts/verify-map-data.mjs [dir]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.resolve(process.argv[2] ?? path.join(root, "dist-map-data"));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));

let failures = 0;
for (const artefact of manifest.artefacts) {
  for (const part of artefact.parts) {
    const data = fs.readFileSync(path.join(dir, part.file));
    const ok = data.length === part.size && crypto.createHash("sha256").update(data).digest("hex") === part.sha256;
    if (!ok) {
      failures++;
      console.log(`FAIL part ${part.file}`);
    }
  }
  const assembled = crypto.createHash("sha256");
  let total = 0;
  for (const part of artefact.parts) {
    const fd = fs.openSync(path.join(dir, part.file), "r");
    const buf = Buffer.alloc(16 * 1024 * 1024);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      assembled.update(buf.subarray(0, n));
      total += n;
    }
    fs.closeSync(fd);
  }
  const ok = total === artefact.size && assembled.digest("hex") === artefact.sha256;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${artefact.name} (${artefact.parts.length} part(s), ${total} bytes)`);
}
if (failures > 0) {
  console.log(`${failures} failure(s)`);
  process.exit(1);
}
console.log(`all artefacts verified for data version ${manifest.dataVersion}`);
