import { groupStats, planWarnings } from "../core/groups.js";
import { hasMetadata } from "../core/workspace.js";

const $ = selector => document.querySelector(selector);
const node = (tag, text, className) => {
  const item = document.createElement(tag);
  if (text != null) item.textContent = text;
  if (className) item.className = className;
  return item;
};
const titleCase = value => value.charAt(0).toUpperCase() + value.slice(1);
const groupName = group => group.name || [group.strain, group.condition].filter(Boolean).join(" / ") || titleCase(group.role);

export function metadataText(record) {
  if (!hasMetadata(record)) return "Unassigned";
  return [record.role || "No role", record.strain ? `Strain: ${record.strain}` : "", record.condition ? `Condition: ${record.condition}` : "",
    record.replicate_id ? `Replicate: ${record.replicate_id}` : "", record.blank_group ? `Blank group: ${record.blank_group}` : ""].filter(Boolean).join("\n");
}

export function createAssignmentPanel(handlers) {
  let state, selectedId = "new", loadedKey = "", renderedRevision = -1, newDraftDirty = false;
  const form = $("#group-form"), picker = $("#group-picker");
  const input = name => form.elements.namedItem(name);
  const draft = () => ({ name: input("name").value.trim(), role: input("role").value,
    strain: input("role").value === "unused" ? "" : input("strain").value.trim(),
    condition: input("role").value === "unused" ? "" : input("condition").value.trim(),
    blank_group: input("role").value === "unused" ? "" : input("blank_group").value.trim(), count: Number(input("count").value) });
  const groupKey = group => JSON.stringify({ name: group.name, role: group.role, strain: group.strain, condition: group.condition, blank_group: group.blank_group, count: group.count });

  function syncRole() {
    const unused = input("role").value === "unused";
    $("#group-count-label").textContent = unused ? "Wells" : "Replicates";
    for (const field of ["strain", "condition", "blank_group"]) input(field).disabled = unused;
  }

  function load(group) {
    const values = group || { name: "", strain: "", condition: "", role: "sample", count: state?.selectedWells.size || 3, blank_group: "" };
    for (const field of ["name", "strain", "condition", "role", "count", "blank_group"]) input(field).value = values[field];
    input("replace_overrides").checked = false;
    newDraftDirty = false;
    loadedKey = group ? groupKey(group) : "new";
    syncRole();
  }

  function readiness() {
    if (!state) return;
    const group = state.groups.find(item => item.id === selectedId);
    $("#preview-assignment").disabled = true;
    $("#group-counts").textContent = "";
    if (!group) { $("#assignment-readiness").textContent = "Save this group, then preview its assignment to selected wells."; return; }
    const stats = groupStats(state, group.id);
    $("#group-counts").textContent = `${group.code}: ${stats.placed} placed / ${group.count} requested / ${stats.remaining.length} remaining${stats.edited.length ? ` / ${stats.edited.length} manually edited` : ""}.`;
    const dirty = JSON.stringify(draft()) !== groupKey(group) || input("replace_overrides").checked;
    const matches = state.selectedWells.size === stats.remaining.length && stats.remaining.length > 0;
    $("#assignment-readiness").textContent = dirty ? "Review and save your group changes before assigning."
      : !stats.remaining.length ? "This group is fully placed. Edit its count or clear a placement to assign more."
      : `Select exactly ${stats.remaining.length} remaining ${group.role === "unused" ? "wells" : "replicates"}; ${state.selectedWells.size} selected.`;
    $("#preview-assignment").disabled = dirty || !matches;
  }

  function choose(id) {
    selectedId = id;
    load(state.groups.find(group => group.id === id));
    render(state);
    handlers.draftChanged?.();
  }

  function render(nextState) {
    state = nextState;
    if (selectedId !== "new" && !state.groups.some(group => group.id === selectedId)) selectedId = "new";
    const group = state.groups.find(item => item.id === selectedId);
    const key = group ? groupKey(group) : "new";
    if (loadedKey !== key) load(group);
    picker.replaceChildren(new Option("New group", "new"), ...state.groups.map(item => new Option(`${item.code}: ${groupName(item)}`, item.id)));
    picker.value = selectedId; picker.disabled = false;
    $("#group-fields").disabled = false; input("count").max = state.plateSize; syncRole();
    $("#save-group").textContent = group ? "Review group changes" : "Save group";
    $("#replace-overrides-label").hidden = !group;
    $("#saved-group-actions").hidden = !group; $("#delete-mode-label").hidden = !group;
    $("#group-up").disabled = !group || state.groups[0].id === selectedId;
    $("#group-down").disabled = !group || state.groups.at(-1).id === selectedId;
    if (renderedRevision !== state.revision) {
      const list = $("#group-list"); list.replaceChildren();
      if (!state.groups.length) list.append(node("li", "No groups defined yet."));
      for (const item of state.groups) {
        const stats = groupStats(state, item.id), row = node("li");
        const button = node("button", `${item.code}: ${groupName(item)}`, "plb-group-link");
        button.type = "button"; button.setAttribute("aria-label", `Edit ${item.code}: ${groupName(item)}`);
        button.addEventListener("click", () => { choose(item.id); picker.focus(); });
        row.append(button, node("span", `${titleCase(item.role)} / ${stats.placed} placed / ${item.count} requested / ${stats.remaining.length} remaining${stats.edited.length ? ` / ${stats.edited.length} edited` : ""}`));
        list.append(row);
      }
      const names = new Set([...state.groups, ...state.wells].map(item => item.blank_group).filter(Boolean));
      $("#blank-groups").replaceChildren(...[...names].sort().map(name => new Option(name, name)));
      const assigned = state.wells.filter(hasMetadata);
      $("#assigned-row-count").textContent = assigned.length;
      const body = $("#metadata-rows"); body.replaceChildren();
      for (const record of assigned) {
        const row = node("tr"), wellCell = node("td"), inspect = node("button", record.well, "plb-group-link");
        inspect.type = "button"; inspect.setAttribute("aria-label", `Inspect ${record.well}`);
        inspect.addEventListener("click", () => handlers.inspect(record.well)); wellCell.append(inspect); row.append(wellCell);
        for (const field of ["strain", "condition", "replicate_id", "role", "blank_group"]) row.append(node("td", record[field] || "—"));
        body.append(row);
      }
      const warnings = planWarnings(state);
      $("#warning-count").textContent = warnings.length; $("#no-warnings").hidden = warnings.length > 0;
      $("#plan-warnings").replaceChildren(...warnings.map(warning => node("li", `${warning.text}${warning.wells.length ? ` Wells: ${warning.wells.join(", ")}.` : ""}`)));
      renderedRevision = state.revision;
    }
    readiness();
  }

  function attempt(action) {
    try { $("#editor-message").textContent = ""; action(); }
    catch (error) { handlers.error(error.message); }
  }
  picker.addEventListener("change", () => choose(picker.value));
  function draftChanged() { newDraftDirty = true; syncRole(); readiness(); handlers.draftChanged?.(); }
  form.addEventListener("input", draftChanged);
  form.addEventListener("change", draftChanged);
  form.addEventListener("submit", event => {
    event.preventDefault();
    attempt(() => handlers.save(selectedId, draft(), input("replace_overrides").checked, choose));
  });
  $("#preview-assignment").addEventListener("click", () => attempt(() => handlers.assign(selectedId)));
  $("#group-up").addEventListener("click", () => attempt(() => handlers.move(selectedId, -1)));
  $("#group-down").addEventListener("click", () => attempt(() => handlers.move(selectedId, 1)));
  $("#delete-group").addEventListener("click", () => attempt(() => handlers.remove(selectedId, $("#delete-mode").value === "clear")));
  function hasUnsavedDraft() {
    const group = state?.groups.find(item => item.id === selectedId);
    return group ? JSON.stringify(draft()) !== groupKey(group) || input("replace_overrides").checked : newDraftDirty;
  }
  return { render, choose, hasUnsavedDraft };
}
