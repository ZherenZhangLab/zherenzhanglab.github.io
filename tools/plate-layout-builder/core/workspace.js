import { containsWell, layoutWells, normalizeWell } from "./plate.js";

export const METADATA_FIELDS = Object.freeze(["well", "strain", "condition", "replicate_id", "role", "blank_group"]);
export const ROLES = Object.freeze(["sample", "blank", "control", "unused"]);

const emptyWell = well => Object.fromEntries(METADATA_FIELDS.map(field => [field, field === "well" ? well : ""]));

export function hasMetadata(record) {
  return METADATA_FIELDS.slice(1).some(field => String(record[field] ?? "").trim() !== "");
}

export function createWorkspace(size = 96) {
  return {
    plateSize: Number(size),
    wells: layoutWells(size).map(emptyWell),
    selectedWells: new Set(),
    activeWell: "A1",
    groups: [],
    provenance: {},
    nextGroupId: 1,
    revision: 0,
    history: []
  };
}

function checkedWell(state, value) {
  const well = normalizeWell(value);
  if (!containsWell(state.plateSize, well)) throw new RangeError(`Well ${value} is outside this plate.`);
  return well;
}

export function focusWell(state, value) {
  return { ...state, activeWell: checkedWell(state, value) };
}

export function selectWells(state, values, { additive = false, toggle = false } = {}) {
  const wells = [...new Set(values.map(value => checkedWell(state, value)))];
  const selectedWells = additive ? new Set(state.selectedWells) : new Set();
  for (const well of wells) {
    if (toggle && selectedWells.has(well)) selectedWells.delete(well);
    else selectedWells.add(well);
  }
  return { ...state, selectedWells };
}

export function clearSelection(state) {
  return { ...state, selectedWells: new Set() };
}

export function commitWorkspace(state, changes, label) {
  const { history, revision, ...snapshot } = state;
  return { ...state, ...changes, revision: revision + 1,
    history: [...history, { label, snapshot: structuredClone(snapshot) }].slice(-40) };
}

export function undoWorkspace(state) {
  const entry = state.history.at(-1);
  if (!entry) return state;
  return { ...structuredClone(entry.snapshot), revision: state.revision + 1, history: state.history.slice(0, -1) };
}

export function resizeImpact(state, nextSize) {
  // Validate even an empty plate before calculating removals.
  layoutWells(nextSize);
  const removedWells = state.wells.filter(record => !containsWell(nextSize, record.well));
  return {
    removedWells,
    metadataOutside: removedWells.filter(hasMetadata),
    selectionOutside: [...state.selectedWells].filter(well => !containsWell(nextSize, well))
  };
}

export function resizeWorkspace(state, nextSize, { allowMetadataRemoval = false } = {}) {
  const impact = resizeImpact(state, nextSize);
  if (impact.metadataOutside.length && !allowMetadataRemoval) {
    throw new Error("Confirm the metadata outside the new layout before changing plate size.");
  }
  const existing = new Map(state.wells.map(record => [record.well, record]));
  return commitWorkspace(state, {
    plateSize: Number(nextSize),
    wells: layoutWells(nextSize).map(well => existing.has(well) ? { ...existing.get(well) } : emptyWell(well)),
    selectedWells: new Set([...state.selectedWells].filter(well => containsWell(nextSize, well))),
    activeWell: containsWell(nextSize, state.activeWell) ? state.activeWell : "A1",
    provenance: Object.fromEntries(Object.entries(state.provenance).filter(([well]) => containsWell(nextSize, well)))
  }, `Change to ${nextSize}-well plate`);
}
