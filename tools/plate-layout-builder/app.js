import { getPlateLayout, isPerimeterWell, layoutWells, sortWells } from "./core/plate.js";
import { createWorkspace, focusWell, selectWells, clearSelection, resizeImpact, resizeWorkspace, hasMetadata, undoWorkspace } from "./core/workspace.js";
import { createPlateMap } from "./ui/plate-map.js";
import { createGroup, moveGroup, previewAssignment, previewGroupUpdate, previewDeleteGroup, previewWellEdits, previewClear, applyPlan } from "./core/groups.js";
import { createAssignmentPanel, metadataText } from "./ui/assignment-panel.js";
import { previewAutomaticAssignment } from "./core/placement.js";
import { createAutomaticPanel } from "./ui/automatic-panel.js";
import { createLayoutPreview } from "./ui/layout-preview.js";
import { createOutputPanel } from "./ui/output-panel.js";

const $ = selector => document.querySelector(selector);
let state = createWorkspace();
let pendingResize = null;
let announcement;
const sizeSelect = $("#plate-size");
const dialog = $("#resize-dialog");
const changeDialog = $("#change-dialog");
let pendingChange = null;
let editTarget = null;
let bulkTargets = [];
let returnFocus = null;

function reportError(message) { $("#editor-message").textContent = message; announce(message); }
function attempt(action) { try { $("#editor-message").textContent = ""; action(); } catch (error) { reportError(error.message); } }

function updateChangeReadiness() {
  if (!pendingChange) return;
  const preview = pendingChange.preview;
  const invalid = pendingChange.invalidated || preview.revision !== state.revision;
  const blocked = preview.automatic && !preview.valid;
  const missingReplacement = preview.conflicts.length && !$("#allow-replacement").checked;
  const missingSpill = preview.spills?.length && !$("#allow-spill").checked;
  $("#apply-change").disabled = Boolean(invalid || blocked || missingReplacement || missingSpill);
  $("#change-error").textContent = invalid ? "The layout or its settings changed. Cancel and generate a fresh preview."
    : preview.errors?.length ? preview.errors.map(error => error.message).join(" ")
    : missingReplacement ? `Occupied wells: ${preview.conflicts.join(", ")}. Review and explicitly allow their replacement.`
    : missingSpill ? "Review and explicitly allow the listed perimeter/interior spill before applying." : "";
}

function renderAutomaticReview(preview) {
  const automatic = Boolean(preview.automatic);
  $("#automatic-review").hidden = !automatic;
  changeDialog.classList.toggle("plb-automatic-dialog", automatic);
  $("#spill-label").hidden = !preview.spills?.length;
  $("#allow-spill").checked = false;
  $("#change-rows").closest(".plb-table-scroll").hidden = automatic && !preview.valid;
  if (!automatic) return;
  const cap = preview.capacity;
  $("#automatic-capacity").textContent = `${preview.plateSize}-well plate: ${cap.requested} to place / ${cap.available} available / ${cap.shortfall} shortfall. ${cap.protected} occupied wells protected; ${cap.replanned} explicitly replanned. Interior: ${cap.interior.available} available, ${cap.interior.preferred} preferred. Perimeter: ${cap.perimeter.available} available, ${cap.perimeter.preferred} preferred.`;
  $("#automatic-order").textContent = `Allocation order: ${preview.order.join(", ") || "none"}. Within each region, wells follow row-major order.`;
  $("#automatic-roles").textContent = cap.byRole.map(row => `${row.role}: ${row.remaining} to place${row.shortfall ? ` (${row.shortfall} shortfall)` : ""}`).join(" / ");
  const body = $("#automatic-capacity-rows"); body.replaceChildren();
  for (const group of cap.byGroup) {
    const row = document.createElement("tr");
    for (const value of [group.code, group.role, group.requested, group.placed, group.remaining, group.fits, group.shortfall]) {
      const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
    }
    body.append(row);
  }
  $("#automatic-existing").textContent = preview.existingConstraints.length
    ? `Existing wells outside this strategy's preference are kept: ${preview.existingConstraints.map(row => `${row.well} (${row.role}, ${row.actual})`).join(", ")}.` : "";
  $("#automatic-spills").replaceChildren(...preview.spills.map(spill => {
    const item = document.createElement("li");
    item.textContent = `${spill.well}: ${spill.group} ${spill.role}${spill.replicate_id ? ` replicate ${spill.replicate_id}` : ""} proposed in the ${spill.actual} instead of the ${spill.preferred}.`;
    return item;
  }));
  $("#automatic-map-panel").hidden = !preview.valid;
  if (preview.valid) layoutPreview.render(state, preview);
}

function review(preview, summary, afterApply) {
  pendingChange = { preview, afterApply };
  returnFocus = document.activeElement;
  $("#change-title").textContent = preview.type;
  $("#change-summary").textContent = summary;
  $("#preserved-note").textContent = preview.preserved.length ? `Manual overrides preserved: ${preview.preserved.join(", ")}.` : "";
  const body = $("#change-rows"); body.replaceChildren();
  for (const change of preview.changes) {
    const row = document.createElement("tr");
    for (const value of [change.well, metadataText(change.before), metadataText(change.after)]) {
      const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
    }
    body.append(row);
  }
  $("#replacement-label").hidden = !preview.conflicts.length;
  $("#allow-replacement").checked = false;
  renderAutomaticReview(preview);
  updateChangeReadiness();
  changeDialog.showModal();
  if (preview.automatic) {
    $("#change-title").tabIndex = -1;
    $("#change-title").focus({ preventScroll: true });
    changeDialog.scrollTop = 0;
  }
}

const assignmentPanel = createAssignmentPanel({
  save(id, draft, replaceOverrides, choose) {
    if (id === "new") {
      state = createGroup(state, draft); render(); choose(state.groups.at(-1).id);
      announce("Group saved. Select its remaining wells and preview assignment.");
    } else {
      const preview = previewGroupUpdate(state, id, draft, { replaceOverrides });
      const definition = [draft.name, draft.strain, draft.condition, draft.role, draft.blank_group].filter(Boolean).join(" / ");
      review(preview, `New group definition: ${definition}. Requested count: ${draft.count}. Listed wells show every proposed change, including any cleared placements.`, () => choose(id));
    }
  },
  assign(id) { const preview = previewAssignment(state, id, [...state.selectedWells]); review(preview, `Assign ${preview.changes.length} selected wells in row-major order. Numeric replicate IDs are scoped to this group.`); },
  move(id, direction) { state = moveGroup(state, id, direction); render(); announce("Group order updated. Well assignments are unchanged."); },
  remove(id, removePlacements) { review(previewDeleteGroup(state, id, { removePlacements }), removePlacements ? "Delete this group and clear its listed wells, including manual overrides." : "Delete the group definition and keep every listed well's metadata as an individual assignment."); },
  inspect(well) { state = focusWell(selectWells(state, [well]), well); render(); plateMap.focus(well); },
  error: reportError,
  draftChanged() { automaticPanel.render(state); }
});

const layoutPreview = createLayoutPreview($("#layout-preview-grid"), $("#layout-preview-detail"));
const automaticPanel = createAutomaticPanel({
  isDraftDirty: () => assignmentPanel.hasUnsavedDraft(),
  announce,
  invalidate() {
    if (pendingChange?.preview.automatic) { pendingChange.invalidated = true; updateChangeReadiness(); }
  },
  preview(strategy, replacementWells) {
    const preview = previewAutomaticAssignment(state, strategy, { replacementWells });
    review(preview, replacementWells.length
      ? `${strategy}. Selected occupied wells are cleared and replanned from saved group definitions; selected targets not reused will be cleared. All other existing assignments stay fixed.`
      : `${strategy}. Place remaining saved-group replicates and keep existing assignments fixed. Cancel leaves the working plate unchanged.`);
  },
  markRemainingUnused() { attempt(() => review(previewClear(state, state.wells.filter(row => !hasMetadata(row)).map(row => row.well), true), "Explicitly mark all remaining unassigned wells unused. Existing metadata is protected; no blank wells are invented.")); }
});

function announce(message) {
  clearTimeout(announcement);
  announcement = setTimeout(() => { $("#status").textContent = message; }, 120);
}

function selectionMessage() {
  const count = state.selectedWells.size;
  return `${count} ${count === 1 ? "well" : "wells"} selected.`;
}

const plateMap = createPlateMap($("#plate-grid"), {
  focus(well) {
    if (state.activeWell === well) return;
    state = focusWell(state, well); render();
  },
  select(wells, options, activeWell) {
    state = selectWells(state, wells, options);
    if (activeWell) state = focusWell(state, activeWell);
    render(); announce(selectionMessage());
  },
  selectAll,
  clear: clear
});

function render() {
  const layout = getPlateLayout(state.plateSize);
  sizeSelect.value = String(layout.size);
  $("#plate-geometry strong").textContent = `${layout.rows} rows × ${layout.columns} columns`;
  $("#selection-count").textContent = selectionMessage().replace(/\.$/, "");
  $("#assignment-count").textContent = `${state.wells.filter(record => !hasMetadata(record)).length} unassigned`;
  $("#clear-selection").disabled = state.selectedWells.size === 0;
  $("#selected-wells").textContent = [...state.selectedWells].sort(sortWells).join(", ") || "No wells selected.";
  const active = state.wells.find(record => record.well === state.activeWell);
  $("#active-well").textContent = active.well;
  $("#well-position").textContent = isPerimeterWell(layout.size, active.well) ? "Perimeter well" : "Interior well";
  for (const field of ["strain", "condition", "replicate_id", "role", "blank_group"]) {
    $("#detail-" + field).textContent = active[field] || (field === "role" ? "Unassigned" : "—");
  }
  const origin = state.provenance[active.well], group = state.groups.find(item => item.id === origin?.groupId);
  $("#well-provenance").textContent = group ? `${group.code}${origin.manual ? ": manually edited; preserved during group updates by default." : ": follows its experimental group."}` : active.role ? "Individual assignment." : "";
  $("#manual-key").hidden = !Object.values(state.provenance).some(value => value.manual);
  $("#edit-well").disabled = false;
  for (const id of ["focus-assignment", "bulk-edit", "clear-metadata", "mark-unused"]) $("#" + id).disabled = !state.selectedWells.size;
  $("#undo-change").disabled = !state.history.length;
  $("#undo-change").title = state.history.length ? `Undo: ${state.history.at(-1).label}` : "No committed changes yet";
  plateMap.render(state);
  assignmentPanel.render(state);
  automaticPanel.render(state);
}

function selectAll() {
  state = selectWells(state, layoutWells(state.plateSize));
  render(); announce(selectionMessage());
}

function clear() {
  state = clearSelection(state);
  render(); announce("Selection cleared. Well metadata is unchanged.");
}

function applyResize(nextSize, allowMetadataRemoval = false) {
  state = resizeWorkspace(state, nextSize, { allowMetadataRemoval });
  render();
  announce(`Changed to a ${state.plateSize}-well plate. ${selectionMessage()} Retained well coordinates are unchanged.`);
}

sizeSelect.addEventListener("change", () => {
  const nextSize = Number(sizeSelect.value);
  if (nextSize === state.plateSize) return;
  const impact = resizeImpact(state, nextSize);
  sizeSelect.value = String(state.plateSize);
  if (!impact.removedWells.length) { applyResize(nextSize); return; }
  pendingResize = { nextSize, impact };
  $("#resize-title").textContent = `Change to a ${nextSize}-well plate?`;
  $("#resize-summary").textContent = `This removes ${impact.removedWells.length} well positions outside A1–${getPlateLayout(nextSize).lastWell}. Retained wells keep their coordinates and metadata.`;
  $("#resize-metadata-note").textContent = impact.metadataOutside.length
    ? `Metadata in ${impact.metadataOutside.length} ${impact.metadataOutside.length === 1 ? "well" : "wells"} will be removed. Review before continuing:`
    : "No metadata is assigned to the removed wells.";
  const list = $("#resize-wells");
  list.replaceChildren();
  for (const record of impact.metadataOutside) {
    const item = document.createElement("li");
    item.textContent = [record.well, record.strain, record.condition, record.role, record.replicate_id, record.blank_group].filter(Boolean).join(" / ");
    list.append(item);
  }
  list.hidden = !impact.metadataOutside.length;
  $("#resize-selection-note").textContent = impact.selectionOutside.length
    ? `${impact.selectionOutside.length} selected ${impact.selectionOutside.length === 1 ? "well" : "wells"} outside the new plate will also leave the selection.`
    : "Your current selection fits the new plate.";
  dialog.showModal();
});

$("#cancel-resize").addEventListener("click", () => { pendingResize = null; dialog.close(); announce("Plate size unchanged."); });
$("#confirm-resize").addEventListener("click", () => {
  if (!pendingResize) return;
  applyResize(pendingResize.nextSize, true);
  pendingResize = null; dialog.close();
});
dialog.addEventListener("cancel", () => { pendingResize = null; announce("Plate size unchanged."); });
dialog.addEventListener("close", () => { sizeSelect.focus(); });
$("#select-all").addEventListener("click", selectAll);
$("#clear-selection").addEventListener("click", clear);
$("#focus-assignment").addEventListener("click", () => $("#group-picker").focus());

$("#allow-replacement").addEventListener("change", updateChangeReadiness);
$("#allow-spill").addEventListener("change", updateChangeReadiness);
$("#cancel-change").addEventListener("click", () => { pendingChange = null; changeDialog.close(); announce("Changes cancelled. Metadata is unchanged."); });
changeDialog.addEventListener("cancel", () => { pendingChange = null; announce("Changes cancelled. Metadata is unchanged."); });
changeDialog.addEventListener("close", () => { if (returnFocus?.isConnected && !returnFocus.disabled) returnFocus.focus(); else $("#group-picker").focus(); });
$("#apply-change").addEventListener("click", () => {
  if (!pendingChange) return;
  try {
    const { preview, afterApply } = pendingChange;
    if (pendingChange.invalidated) throw new Error("Preview settings changed. Generate a fresh preview.");
    state = applyPlan(state, preview, { replaceExisting: $("#allow-replacement").checked, allowSpill: $("#allow-spill").checked });
    pendingChange = null; render(); afterApply?.(); changeDialog.close(); announce(`${preview.type} applied. You can undo this change.`);
  } catch (error) { $("#change-error").textContent = error.message; }
});

$("#undo-change").addEventListener("click", () => {
  const label = state.history.at(-1)?.label;
  state = undoWorkspace(state); render(); announce(label ? `Undid: ${label}.` : "No changes to undo.");
});
$("#clear-metadata").addEventListener("click", () => attempt(() => review(previewClear(state, [...state.selectedWells]), "Clear all metadata in the listed selected wells. Other replicate IDs will not be renumbered.")));
$("#mark-unused").addEventListener("click", () => attempt(() => review(previewClear(state, [...state.selectedWells], true), "Mark these selected wells unused and clear their biological metadata, group links and replicate IDs.")));

function syncWellRole() {
  const form = $("#well-edit-form"), unused = form.elements.role.value === "unused";
  for (const field of ["strain", "condition", "replicate_id", "blank_group"]) form.elements[field].disabled = unused;
}
$("#edit-well").addEventListener("click", () => {
  editTarget = state.activeWell;
  const record = state.wells.find(row => row.well === editTarget), form = $("#well-edit-form");
  for (const field of ["strain", "condition", "replicate_id", "role", "blank_group"]) form.elements[field].value = record[field] || (field === "role" ? "sample" : field === "replicate_id" ? "1" : "");
  $("#well-edit-title").textContent = `Edit ${editTarget}`; form.querySelector(".plb-form-error").textContent = "";
  syncWellRole(); $("#well-edit-dialog").showModal();
});
$("#well-edit-form select[name='role']").addEventListener("change", syncWellRole);
$("#well-edit-form").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    const patch = Object.fromEntries(["strain", "condition", "replicate_id", "role", "blank_group"].map(field => [field, form.elements[field].value]));
    const preview = previewWellEdits(state, [editTarget], patch);
    $("#well-edit-dialog").close(); review(preview, `Only ${editTarget} changes. Other wells and replicate labels are preserved.`);
  } catch (error) { event.currentTarget.querySelector(".plb-form-error").textContent = error.message; }
});
$("#bulk-edit").addEventListener("click", () => {
  bulkTargets = [...state.selectedWells]; $("#bulk-edit-form").reset(); $("#bulk-edit-form .plb-form-error").textContent = "";
  $("#bulk-edit-title").textContent = `Edit fields in ${bulkTargets.length} selected wells`; $("#bulk-edit-dialog").showModal();
});
$("#bulk-edit-form").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const form = event.currentTarget, patch = {};
    for (const field of ["strain", "condition", "role", "blank_group"]) if (form.elements["change_" + field].checked) patch[field] = form.elements[field].value;
    if (!Object.keys(patch).length) throw new Error("Check at least one field to change.");
    const preview = previewWellEdits(state, bulkTargets, patch, { bulk: true });
    $("#bulk-edit-dialog").close(); review(preview, "Only checked fields change. Individual replicate IDs remain distinct unless a well is marked unused.");
  } catch (error) { event.currentTarget.querySelector(".plb-form-error").textContent = error.message; }
});
document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => document.getElementById(button.dataset.close).close()));

const outputPanel = createOutputPanel({ getState: () => state, isDraftDirty: () => assignmentPanel.hasUnsavedDraft(), announce });
render();
outputPanel.enable();
sizeSelect.disabled = false;
$("#select-all").disabled = false;
