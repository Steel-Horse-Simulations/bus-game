// Packages pipeline-data/ into release-ready map-data artefacts: large files
// are split into parts under GitHub Releases' 2 GiB per-asset limit, and a
// manifest.json records every part's size and SHA-256 so the game can verify
// a download before using it. Run: node scripts/package-map-data.mjs <version>
//
// Each artefact has a local `path` (where the game stores it, relative to the
// map-data folder) and parts with a release `file` name (flat, since release
// asset names cannot contain slashes or spaces).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "pipeline-data");
const outDir = path.join(root, "dist-map-data");
const SPLIT_OVER_BYTES = 1_900_000_000;
const PART_BYTES = 500_000_000;

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("usage: node scripts/package-map-data.mjs <major.minor.patch>");
  process.exit(1);
}

const TOP_LEVEL = [
  "road_graph.bin",
  "stops.bin",
  "landuse.bin",
  "venues.bin",
  "railway.bin",
  "settlements.bin",
  "tiles.pmtiles",
];

function fontFiles() {
  const fontsRoot = path.join(sourceDir, "fonts");
  const out = [];
  for (const stack of fs.readdirSync(fontsRoot)) {
    for (const file of fs.readdirSync(path.join(fontsRoot, stack))) {
      out.push(path.posix.join("fonts", stack, file));
    }
  }
  return out;
}

function releaseFileName(localPath) {
  return localPath.replace(/[\\/]+/g, "-").replace(/\s+/g, "-");
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

async function splitIntoParts(file, localPath) {
  const size = fs.statSync(file).size;
  if (size <= SPLIT_OVER_BYTES) {
    const name = releaseFileName(localPath);
    const dest = path.join(outDir, name);
    fs.copyFileSync(file, dest);
    return [{ file: name, size, sha256: await sha256File(dest) }];
  }
  const parts = [];
  const input = fs.openSync(file, "r");
  const buffer = Buffer.alloc(16 * 1024 * 1024);
  let offset = 0;
  let index = 0;
  while (offset < size) {
    const partName = `${releaseFileName(localPath)}.part${String(index).padStart(3, "0")}`;
    const dest = path.join(outDir, partName);
    const out = fs.openSync(dest, "w");
    let written = 0;
    while (written < PART_BYTES && offset < size) {
      const want = Math.min(buffer.length, PART_BYTES - written, size - offset);
      const read = fs.readSync(input, buffer, 0, want, offset);
      fs.writeSync(out, buffer, 0, read);
      written += read;
      offset += read;
    }
    fs.closeSync(out);
    parts.push({ file: partName, size: written, sha256: await sha256File(dest) });
    index++;
  }
  fs.closeSync(input);
  return parts;
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const localPaths = [...TOP_LEVEL, ...fontFiles()];
const artefacts = [];
for (const localPath of localPaths) {
  const file = path.join(sourceDir, localPath);
  if (!fs.existsSync(file)) {
    console.error(`missing ${file}`);
    process.exit(1);
  }
  const parts = await splitIntoParts(file, localPath);
  artefacts.push({
    path: localPath.split(path.sep).join("/"),
    size: fs.statSync(file).size,
    sha256: await sha256File(file),
    parts,
  });
  console.log(`${localPath}: ${parts.length} part(s)`);
}

fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify({ dataVersion: version, artefacts }, null, 2) + "\n",
);
console.log(`wrote ${outDir}/manifest.json (data version ${version})`);
