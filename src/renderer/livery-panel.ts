// Minimal livery settings (OPERATIONS.md §4): list and add liveries, and set
// each support vehicle icon's black/white override per livery. "Automatic"
// clears the override, so the icon goes back to the contrast pick.
const ICONS: { key: SupportIconKey; label: string }[] = [
  { key: "spanner", label: "Spanner" },
  { key: "person", label: "Person" },
  { key: "recovery", label: "Recovery" },
  { key: "parcel", label: "Parcel" },
];

export function mountLiveryPanel(): void {
  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Liveries";
  toggle.style.position = "absolute";
  toggle.style.bottom = "8px";
  toggle.style.left = "1000px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.bottom = "44px";
  panel.style.left = "1000px";
  panel.style.zIndex = "2";
  panel.style.width = "360px";
  panel.style.maxHeight = "75vh";
  panel.style.overflowY = "auto";
  panel.style.flexDirection = "column";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = "Liveries";
  panel.appendChild(header);

  const body = document.createElement("div");
  body.style.padding = "8px 12px";
  panel.appendChild(body);

  let selectedId: number | null = null;
  let errorMessage = "";

  async function render(): Promise<void> {
    body.replaceChildren();
    const liveries = await window.liveries.list();

    if (liveries.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "var(--text-muted)";
      empty.textContent = "No liveries yet.";
      body.appendChild(empty);
    }

    for (const livery of liveries) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.padding = "6px 0";
      row.style.cursor = "pointer";
      row.style.fontWeight = livery.id === selectedId ? "600" : "normal";

      for (const colour of [livery.primaryColour, livery.secondaryColour]) {
        const swatch = document.createElement("span");
        swatch.style.width = "14px";
        swatch.style.height = "14px";
        swatch.style.border = "1px solid var(--border)";
        swatch.style.background = colour;
        row.appendChild(swatch);
      }
      const name = document.createElement("span");
      name.textContent = livery.name;
      row.appendChild(name);

      row.addEventListener("click", () => {
        selectedId = livery.id;
        errorMessage = "";
        void render();
      });
      body.appendChild(row);
    }

    const form = document.createElement("div");
    form.style.borderTop = "1px solid var(--border)";
    form.style.marginTop = "8px";
    form.style.paddingTop = "8px";
    const nameInput = document.createElement("input");
    nameInput.placeholder = "Name";
    const primaryInput = document.createElement("input");
    primaryInput.placeholder = "#rrggbb primary";
    const secondaryInput = document.createElement("input");
    secondaryInput.placeholder = "#rrggbb secondary";
    const addButton = document.createElement("button");
    addButton.className = "btn";
    addButton.textContent = "Add livery";
    addButton.addEventListener("click", async () => {
      try {
        const created = await window.liveries.create(nameInput.value.trim(), primaryInput.value.trim(), secondaryInput.value.trim());
        selectedId = created.id;
        errorMessage = "";
        await render();
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
        await render();
      }
    });
    for (const el of [nameInput, primaryInput, secondaryInput, addButton]) {
      el.style.display = "block";
      el.style.marginBottom = "4px";
      form.appendChild(el);
    }
    body.appendChild(form);

    if (selectedId !== null) {
      const selected = liveries.find((l) => l.id === selectedId);
      if (selected) {
        const overrides = await window.liveries.listIconOverrides(selected.id);
        const section = document.createElement("div");
        section.style.borderTop = "1px solid var(--border)";
        section.style.marginTop = "8px";
        section.style.paddingTop = "8px";
        const title = document.createElement("div");
        title.style.fontWeight = "600";
        title.textContent = `Support icons — ${selected.name}`;
        section.appendChild(title);

        for (const icon of ICONS) {
          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.alignItems = "center";
          row.style.padding = "4px 0";
          const label = document.createElement("span");
          label.textContent = icon.label;
          row.appendChild(label);

          const select = document.createElement("select");
          const current = overrides.find((o) => o.icon === icon.key)?.colour ?? "";
          for (const [value, text] of [["", "Automatic"], ["black", "Black"], ["white", "White"]] as const) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            option.selected = value === current;
            select.appendChild(option);
          }
          select.addEventListener("change", async () => {
            const colour = select.value === "" ? null : (select.value as IconColour);
            await window.liveries.setIconOverride(selected.id, icon.key, colour);
            await render();
          });
          row.appendChild(select);
          section.appendChild(row);
        }
        body.appendChild(section);
      }
    }

    if (errorMessage) {
      const error = document.createElement("div");
      error.style.color = "#f87171";
      error.style.marginTop = "6px";
      error.textContent = errorMessage;
      body.appendChild(error);
    }
  }

  let panelOpen = false;
  toggle.addEventListener("click", () => {
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? "flex" : "none";
    toggle.classList.toggle("is-active", panelOpen);
    if (panelOpen) void render();
  });
}
