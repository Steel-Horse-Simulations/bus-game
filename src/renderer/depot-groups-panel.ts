import { createDropdown, type Dropdown } from "./dropdown";

// Depot groups screen (OPERATIONS.md §1) — the first real save-data object
// with its own UI, rather than something shadowing imported OSM data. A
// depot group is just a name and a region until routes, depots and fare
// zones exist to hang off it.
//
// Must match electron/db.mts's REGIONS — duplicated here since the renderer
// can't import a plain value across the IPC boundary, only call it.
const REGIONS = [
  "North Scotland",
  "West Scotland",
  "East Scotland",
  "Shetland",
  "North England",
];

function regionDropdown(selected: string, onChange: (value: string) => void): Dropdown {
  return createDropdown(REGIONS, selected, onChange);
}

export function mountDepotGroupsPanel(): void {
  const toggle = document.createElement("button");
  toggle.className = "btn";
  toggle.textContent = "Depot groups";
  toggle.style.position = "absolute";
  toggle.style.top = "8px";
  toggle.style.right = "8px";
  toggle.style.zIndex = "2";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.position = "absolute";
  panel.style.top = "40px";
  panel.style.right = "8px";
  panel.style.zIndex = "2";
  panel.style.width = "320px";
  panel.hidden = true;
  document.body.appendChild(panel);

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.classList.toggle("is-active", !panel.hidden);
    if (!panel.hidden) void refresh();
  });

  const title = document.createElement("div");
  title.className = "panel-header";
  title.textContent = "Depot groups";
  panel.appendChild(title);

  const list = document.createElement("div");
  list.className = "panel-section";
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "1px";
  list.style.padding = "0";
  panel.appendChild(list);

  const addRow = document.createElement("div");
  addRow.className = "panel-section";
  addRow.style.display = "flex";
  addRow.style.flexDirection = "column";
  addRow.style.gap = "6px";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "field";
  nameInput.placeholder = "New depot group name";
  const addControls = document.createElement("div");
  addControls.style.display = "flex";
  addControls.style.gap = "6px";
  const newRegionDropdown = regionDropdown(REGIONS[0], () => {});
  newRegionDropdown.el.style.flex = "1";
  const addButton = document.createElement("button");
  addButton.className = "btn";
  addButton.textContent = "Add";
  addControls.appendChild(newRegionDropdown.el);
  addControls.appendChild(addButton);
  addRow.appendChild(nameInput);
  addRow.appendChild(addControls);
  panel.appendChild(addRow);

  const refresh = async () => {
    const groups = await window.depotGroups.list();
    list.innerHTML = "";
    if (groups.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No depot groups yet.";
      empty.style.color = "var(--text-muted)";
      empty.style.padding = "8px";
      list.appendChild(empty);
    }
    for (const group of groups) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "6px";
      row.style.alignItems = "center";
      row.style.padding = "6px 0";
      row.style.borderBottom = "1px solid var(--border)";

      const nameField = document.createElement("input");
      nameField.type = "text";
      nameField.className = "field";
      nameField.value = group.name;
      nameField.style.flex = "1";
      nameField.addEventListener("change", () => {
        void window.depotGroups.rename(group.id, nameField.value);
      });

      const region = regionDropdown(group.region, (value) => {
        void window.depotGroups.setRegion(group.id, value);
      });
      region.el.style.flex = "1";
      region.el.style.minWidth = "0";

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-icon btn-danger";
      deleteButton.textContent = "×";
      deleteButton.title = "Delete depot group";
      deleteButton.addEventListener("click", async () => {
        await window.depotGroups.delete(group.id);
        await refresh();
      });

      row.appendChild(nameField);
      row.appendChild(region.el);
      row.appendChild(deleteButton);
      list.appendChild(row);
    }
    const rows = list.querySelectorAll<HTMLDivElement>(":scope > div");
    const last = rows[rows.length - 1];
    if (last) last.style.borderBottom = "none";
  };

  addButton.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    await window.depotGroups.create(name, newRegionDropdown.value);
    nameInput.value = "";
    await refresh();
  });
}
