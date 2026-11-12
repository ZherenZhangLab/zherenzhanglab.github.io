import { createPlateMap } from "./plate-map.js";
import { metadataText } from "./assignment-panel.js";
import { hasMetadata } from "../core/workspace.js";

export function createLayoutPreview(table, detail) {
  let source, candidate, changes;
  const map = createPlateMap(table, {
    focus(well) { candidate = { ...candidate, activeWell: well }; refresh(); },
    select(wells, _options, activeWell) {
      candidate = { ...candidate, selectedWells: new Set(wells), activeWell: activeWell || wells[0] };
      refresh();
    },
    clear() { candidate = { ...candidate, selectedWells: new Set() }; refresh(); },
    selectAll() { candidate = { ...candidate, selectedWells: new Set(candidate.wells.map(row => row.well)) }; refresh(); }
  });
  function status(well) {
    const change = changes.get(well);
    return !change ? "kept" : !hasMetadata(change.after) ? "cleared" : hasMetadata(change.before) ? "replaced" : "new";
  }
  function refresh() {
    map.render(candidate);
    for (const button of table.querySelectorAll("[data-well]")) {
      const kind = status(button.dataset.well);
      button.dataset.previewStatus = kind;
      button.setAttribute("aria-label", `${button.getAttribute("aria-label")}, ${kind} in proposed layout`);
    }
    const well = candidate.activeWell, before = source.wells.find(row => row.well === well), after = candidate.wells.find(row => row.well === well);
    detail.textContent = `${well} — ${status(well)}\nCurrent: ${metadataText(before)}\nProposed: ${metadataText(after)}`;
  }
  function render(state, preview) {
    source = state; changes = new Map(preview.changes.map(change => [change.well, change]));
    const provenance = { ...state.provenance };
    for (const change of preview.changes) {
      if (change.provenance) provenance[change.well] = change.provenance;
      else delete provenance[change.well];
    }
    candidate = { ...state, wells: state.wells.map(row => changes.get(row.well)?.after || row), provenance,
      selectedWells: new Set(), activeWell: preview.changes[0]?.well || "A1" };
    refresh();
  }
  return { render };
}
