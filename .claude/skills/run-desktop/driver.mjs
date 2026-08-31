// REPL driver for the Bus Game Electron app.
// Designed for agents: run it, pipe commands to stdin, read stdout.
import { _electron as electron } from "playwright-core";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";

const APP_DIR = path.resolve(import.meta.dirname, "../../..");
const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(APP_DIR, ".driver-shots");
fs.mkdirSync(SHOT_DIR, { recursive: true });

let app = null;
let page = null;

const electronBin = path.join(APP_DIR, "node_modules/electron/dist/electron.exe");

const COMMANDS = {
  async launch() {
    if (app) return console.log("already launched");
    app = await electron.launch({
      executablePath: electronBin,
      args: [APP_DIR],
      timeout: 30_000,
    });
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    console.log("launched.", app.windows().length, "window(s):");
    for (const w of app.windows()) console.log(" ", w.url());
  },

  async ss(name) {
    if (!page) return console.log("ERROR: launch first");
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + ".png");
    await page.screenshot({ path: f });
    console.log("screenshot:", f);
  },

  async text(sel) {
    if (!page) return console.log("ERROR: launch first");
    console.log(
      await page.evaluate(
        (s) => (s ? document.querySelector(s) : document.body)?.innerText ?? "(null)",
        sel || null,
      ),
    );
  },

  async eval(expr) {
    if (!page) return console.log("ERROR: launch first");
    try {
      console.log(JSON.stringify(await page.evaluate(expr)));
    } catch (e) {
      console.log("ERROR:", e.message);
    }
  },

  async windows() {
    if (!app) return console.log("ERROR: launch first");
    for (const w of app.windows()) console.log(" ", w.url());
  },

  async quit() {
    if (app) await app.close().catch(() => {});
    app = null;
    page = null;
  },

  help() {
    console.log("commands:", Object.keys(COMMANDS).join(", "));
  },
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "driver> " });

rl.on("line", async (line) => {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  if (!cmd) return rl.prompt();
  const fn = COMMANDS[cmd];
  if (!fn) {
    console.log("unknown:", cmd, "- try: help");
    return rl.prompt();
  }
  try {
    await fn(rest.join(" "));
  } catch (e) {
    console.log("ERROR:", e.message);
  }
  if (cmd === "quit") {
    rl.close();
    process.exit(0);
  }
  rl.prompt();
});
rl.on("close", async () => {
  await COMMANDS.quit();
  process.exit(0);
});

console.log('Bus Game driver - "help" for commands, "launch" to start');
rl.prompt();
