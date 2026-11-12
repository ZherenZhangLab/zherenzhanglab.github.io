import { groupStats } from "../core/groups.js";
import { hasMetadata } from "../core/workspace.js";
import { sortWells } from "../core/plate.js";

const $ = selector => document.querySelector(selector);
const descriptions = {
  Manual: "Manual keeps placement in the group editor. No automatic placement is performed.",
  Compact: "Fill available wells in row-major group order. Explicit unused groups are placed last.",
  "Avoid outer wells": "Sample, control and blank groups prefer the interior. Unused groups prefer the perimeter. Spill requires review.",
  "Use outer wells for blanks": "Place requested blanks on the perimeter first, then sample/control groups in the interior. Unused groups follow. Spill requires review."
};

export function createAutomaticPanel(handlers) {
  let state, signature = "";
  const strategy = $("#layout-strategy"), replan = $("#replan-selection");
  function settings() {
    return { strategy: strategy.value, replacementWells: replan.checked
      ? state.wells.filter(row => state.selectedWells.has(row.well) && hasMetadata(row)).map(row => row.well) : [] };
  }
  function render(nextState) {
    state = nextState;
    const occupied = state.wells.filter(row => state.selectedWells.has(row.well) && hasMetadata(row));
    if (!occupied.length) replan.checked = false;
    replan.disabled = !occupied.length;
    strategy.disabled = false;
    const dirty = handlers.isDraftDirty(), options = settings();
    const nextSignature = JSON.stringify([state.revision, options.strategy, replan.checked,
      replan.checked ? [...state.selectedWells].sort(sortWells) : [], dirty]);
    if (signature && signature !== nextSignature) handlers.invalidate();
    signature = nextSignature;
    const remaining = state.groups.reduce((sum, group) => sum + groupStats(state, group.id).remaining.length, 0);
    const groupReplan = options.replacementWells.some(well => state.groups.some(group => group.id === state.provenance[well]?.groupId));
    $("#preview-automatic").disabled = options.strategy === "Manual" || !state.groups.length || dirty || (!remaining && !groupReplan);
    $("#mark-remaining-unused").disabled = state.wells.every(hasMetadata);
    $("#automatic-guidance").textContent = descriptions[options.strategy] + (dirty ? " Save or discard group drafts first."
      : !state.groups.length ? " Save experimental groups to enable automatic placement."
      : ` ${remaining} group wells remain unplaced.`);
    $("#automatic-targets").textContent = replan.checked
      ? `Replan targets: ${options.replacementWells.join(", ")}. Their metadata is rebuilt from saved groups; targets not reused will be cleared. Other assignments stay fixed.`
      : `${occupied.length} selected occupied wells. Existing assignments stay fixed unless you explicitly choose to replan them.`;
  }
  strategy.addEventListener("change", () => { $("#automatic-message").textContent = ""; render(state); });
  replan.addEventListener("change", () => { $("#automatic-message").textContent = ""; render(state); });
  $("#preview-automatic").addEventListener("click", () => {
    try {
      $("#automatic-message").textContent = "";
      if (handlers.isDraftDirty()) throw new Error("Save or discard group drafts before previewing an automatic layout.");
      const options = settings(); handlers.preview(options.strategy, options.replacementWells);
    } catch (error) { $("#automatic-message").textContent = error.message; handlers.announce(error.message); }
  });
  $("#mark-remaining-unused").addEventListener("click", () => handlers.markRemainingUnused());
  return { render };
}
