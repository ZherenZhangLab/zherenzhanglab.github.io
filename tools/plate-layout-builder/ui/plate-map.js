import { getPlateLayout, rowWells, columnWells, navigateWell } from "../core/plate.js";

const element = (tag, attributes = {}, text) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text != null) node.textContent = text;
  return node;
};

export function createPlateMap(table, handlers) {
  let state;
  let renderedSize;
  let drag = null;
  const buttons = new Map();
  const cells = new Map();
  const axes = [];
  const modified = event => event.shiftKey || event.metaKey || event.ctrlKey;
  const wellButton = target => target instanceof Element ? target.closest("button[data-well]") : null;

  function focus(well, scroll = true) {
    const button = buttons.get(well);
    button?.focus({ preventScroll: true });
    if (scroll) button?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function build() {
    const layout = getPlateLayout(state.plateSize);
    buttons.clear(); cells.clear(); axes.length = 0; drag = null;
    table.replaceChildren();
    table.dataset.size = String(layout.size);
    table.setAttribute("aria-label", `${layout.size}-well plate map`);
    table.setAttribute("aria-rowcount", String(layout.rows + 1));
    table.setAttribute("aria-colcount", String(layout.columns + 1));
    const colgroup = element("colgroup");
    for (let column = 0; column <= layout.columns; column += 1) colgroup.append(element("col"));
    table.append(colgroup);
    const head = element("thead"), header = element("tr");
    header.append(element("th", { scope: "col" }));
    for (let column = 1; column <= layout.columns; column += 1) {
      const cell = element("th", { scope: "col" });
      const button = element("button", { type: "button", class: "plb-axis", "data-column": column, "aria-label": `Select column ${column}`, "aria-pressed": false }, column);
      axes.push({ button, wells: columnWells(layout.size, column) });
      cell.append(button); header.append(cell);
    }
    head.append(header); table.append(head);
    const body = element("tbody");
    for (let row = 0; row < layout.rows; row += 1) {
      const letter = String.fromCharCode(65 + row), line = element("tr");
      const label = element("th", { scope: "row" });
      const axis = element("button", { type: "button", class: "plb-axis", "data-row": letter, "aria-label": `Select row ${letter}`, "aria-pressed": false }, letter);
      axes.push({ button: axis, wells: rowWells(layout.size, letter) });
      label.append(axis); line.append(label);
      for (const well of rowWells(layout.size, letter)) {
        const cell = element("td", { role: "gridcell", "aria-selected": false });
        const button = element("button", { type: "button", class: "plb-well", "data-well": well, tabindex: -1, "aria-pressed": false }, well);
        buttons.set(well, button); cells.set(well, cell);
        cell.append(button); line.append(cell);
      }
      body.append(line);
    }
    table.append(body);
    table.parentElement.scrollLeft = 0;
    renderedSize = state.plateSize;
  }

  function render(nextState) {
    state = nextState;
    if (renderedSize !== state.plateSize) build();
    for (const record of state.wells) {
      const selected = state.selectedWells.has(record.well);
      const button = buttons.get(record.well);
      const label = [record.well, record.role || "unassigned", record.strain, record.condition,
        record.replicate_id ? `replicate ${record.replicate_id}` : "", record.blank_group ? `blank group ${record.blank_group}` : ""].filter(Boolean).join(", ");
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("aria-label", label);
      button.title = label;
      button.dataset.role = record.role;
      const origin = state.provenance[record.well], group = state.groups.find(item => item.id === origin?.groupId);
      if (record.role) {
        const role = { sample: "S", control: "C", blank: "B", unused: "U" }[record.role];
        const identity = state.plateSize <= 48 ? record.strain || group?.code || "" : group?.code || record.strain || "";
        button.replaceChildren(element("span", { class: "plb-well-coordinate" }, record.well),
          element("span", { class: "plb-well-identity" }, identity + (origin?.manual ? "*" : "")),
          element("span", { class: "plb-well-replicate" }, `${role}${record.replicate_id ? " " + record.replicate_id : ""}`));
      } else if (button.childElementCount) button.textContent = record.well;
      button.tabIndex = record.well === state.activeWell ? 0 : -1;
      cells.get(record.well).setAttribute("aria-selected", String(selected));
    }
    for (const { button, wells } of axes) {
      const count = wells.filter(well => state.selectedWells.has(well)).length;
      button.setAttribute("aria-pressed", count === wells.length ? "true" : count ? "mixed" : "false");
    }
  }

  table.addEventListener("focusin", event => {
    const button = wellButton(event.target);
    if (button) handlers.focus(button.dataset.well);
  });

  table.addEventListener("pointerdown", event => {
    const button = wellButton(event.target);
    if (!button || event.button !== 0 || event.pointerType === "touch") return;
    event.preventDefault();
    const well = button.dataset.well;
    drag = { pointerId: event.pointerId, visited: new Set([well]) };
    handlers.select([well], { additive: modified(event), toggle: modified(event) }, well);
    focus(well, false);
  });

  table.addEventListener("pointerover", event => {
    const button = wellButton(event.target);
    if (!drag || !button || event.pointerId !== drag.pointerId || !(event.buttons & 1)) return;
    const well = button.dataset.well;
    if (drag.visited.has(well)) return;
    drag.visited.add(well);
    handlers.select([well], { additive: true }, well);
  });

  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    focus(state.activeWell, false);
  }
  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);
  window.addEventListener("blur", () => { drag = null; });

  table.addEventListener("click", event => {
    const button = wellButton(event.target);
    // Mouse/pen selection is handled on pointerdown; keyboard/AT and touch use click.
    if (button && (event.detail === 0 || event.pointerType === "touch")) {
      handlers.select([button.dataset.well], { additive: modified(event), toggle: modified(event) }, button.dataset.well);
      focus(button.dataset.well, false);
      return;
    }
    const axis = event.target.closest("button[data-row], button[data-column]");
    if (axis) {
      const wells = axis.dataset.row ? rowWells(state.plateSize, axis.dataset.row) : columnWells(state.plateSize, axis.dataset.column);
      handlers.select(wells, { additive: modified(event) });
    }
  });

  table.addEventListener("keydown", event => {
    const button = wellButton(event.target);
    if (!button) return;
    const well = button.dataset.well;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = navigateWell(state.plateSize, well, event.key, event.ctrlKey || event.metaKey);
      if (event.shiftKey) handlers.select([next], { additive: true }, next);
      else handlers.focus(next);
      focus(next);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const additive = event.key === " " || modified(event);
      handlers.select([well], { additive, toggle: additive }, well);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault(); handlers.selectAll();
    } else if (event.key === "Escape") {
      event.preventDefault(); handlers.clear();
    }
  });

  return { render, focus };
}
