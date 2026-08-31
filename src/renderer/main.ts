import init, { add } from "./wasm/game_wasm.js";

const app = document.getElementById("app")!;

init().then(() => {
  app.textContent = `Bus Game — Electron shell running. Rust/WASM round trip: add(2, 3) = ${add(2, 3)}`;
});
