import { containsWell, normalizeWell, sortWells } from "./plate.js";
import { METADATA_FIELDS, ROLES, hasMetadata, commitWorkspace } from "./workspace.js";

const clean = value => String(value ?? "").trim();
const empty = well => Object.fromEntries(METADATA_FIELDS.map(field => [field, field === "well" ? well : ""]));
const fields = ["strain", "condition", "replicate_id", "role", "blank_group"];

export function normalizedMetadata(source) {
  const record = Object.fromEntries(fields.map(field => [field, clean(source[field])]));
  if (record.role && !ROLES.includes(record.role)) throw new Error("Choose sample, control, blank or unused.");
  if (record.role === "unused") return { strain: "", condition: "", replicate_id: "", role: "unused", blank_group: "" };
  if (!record.role && fields.some(field => record[field])) throw new Error("Choose a role or clear all metadata.");
  if (record.role && !/^[1-9]\d*$/.test(record.replicate_id)) throw new Error("Replicate ID must be a positive whole number, such as 1, 2 or 3.");
  return record;
}

function groupDraft(source, plateSize) {
  const role = clean(source.role);
  if (!ROLES.includes(role)) throw new Error("Choose a group role.");
  const count = Number(source.count);
  if (!Number.isInteger(count) || count < 1 || count > plateSize) throw new Error(`Use a whole-number count from 1 to ${plateSize}.`);
  return { name: clean(source.name), strain: role === "unused" ? "" : clean(source.strain),
    condition: role === "unused" ? "" : clean(source.condition), role,
    blank_group: role === "unused" ? "" : clean(source.blank_group), count };
}

function findGroup(state, id) {
  const group = state.groups.find(item => item.id === id);
  if (!group) throw new Error("Choose an experimental group first.");
  return group;
}

export function createGroup(state, source) {
  const group = { ...groupDraft(source, state.plateSize), id: `g${state.nextGroupId}`, code: `G${state.nextGroupId}` };
  return commitWorkspace(state, { groups: [...state.groups, group], nextGroupId: state.nextGroupId + 1 }, `Create ${group.code}`);
}

export function groupStats(state, id) {
  const group = findGroup(state, id);
  const placements = Object.entries(state.provenance).filter(([, value]) => value.groupId === id);
  const used = new Set(placements.map(([, value]) => value.index));
  const remaining = Array.from({ length: group.count }, (_, index) => index + 1).filter(index => !used.has(index));
  return { placed: placements.length, remaining, edited: placements.filter(([, value]) => value.manual).map(([well]) => well) };
}

export function moveGroup(state, id, offset) {
  const from = state.groups.findIndex(group => group.id === id), to = from + offset;
  if (from < 0 || to < 0 || to >= state.groups.length) return state;
  const groups = [...state.groups];
  [groups[from], groups[to]] = [groups[to], groups[from]];
  return commitWorkspace(state, { groups }, "Reorder groups");
}

function checkedTargets(state, values) {
  const wells = [...new Set(values.map(normalizeWell))].sort(sortWells);
  if (!wells.length || wells.some(well => !containsWell(state.plateSize, well))) throw new Error("Select valid wells on this plate.");
  return wells;
}

function plan(state, type, changes, extra = {}) {
  return { revision: state.revision, type, changes, conflicts: [], preserved: [], ...extra };
}

export function previewAssignment(state, id, values) {
  const group = findGroup(state, id), remaining = groupStats(state, id).remaining;
  const wells = checkedTargets(state, values);
  if (!remaining.length) throw new Error(`${group.code} is fully placed. Clear a placement or increase its count first.`);
  if (wells.length !== remaining.length) throw new Error(`Select exactly ${remaining.length} remaining ${group.role === "unused" ? "wells" : "replicates"} for ${group.code}; ${wells.length} selected.`);
  const changes = wells.map((well, index) => ({ well, before: state.wells.find(record => record.well === well),
    after: { ...normalizedMetadata({ ...group, replicate_id: String(remaining[index]) }), well },
    provenance: { groupId: id, index: remaining[index], manual: false } }));
  return plan(state, "Assign selected wells", changes, { conflicts: changes.filter(change => hasMetadata(change.before)).map(change => change.well) });
}

export function previewGroupUpdate(state, id, source, { replaceOverrides = false } = {}) {
  const group = { ...findGroup(state, id), ...groupDraft(source, state.plateSize) };
  const changes = [], preserved = [];
  for (const [well, origin] of Object.entries(state.provenance)) {
    if (origin.groupId !== id) continue;
    const before = state.wells.find(record => record.well === well);
    if (origin.manual && !replaceOverrides) {
      if (origin.index > group.count) throw new Error(`${well} is manually edited and exceeds the new count. Keep a larger count or explicitly replace manual overrides.`);
      preserved.push(well); continue;
    }
    changes.push({ well, before,
      after: origin.index > group.count ? empty(well) : { ...normalizedMetadata({ ...group, replicate_id: String(origin.index) }), well },
      provenance: origin.index > group.count ? null : { ...origin, manual: false } });
  }
  return plan(state, `Update ${group.code}`, changes, { groups: state.groups.map(item => item.id === id ? group : item), preserved });
}

export function previewWellEdits(state, values, patch, { bulk = false } = {}) {
  if (!Object.keys(patch).length) throw new Error("Choose at least one metadata field to change.");
  if (bulk && Object.hasOwn(patch, "replicate_id")) throw new Error("Edit replicate IDs one well at a time; bulk edits preserve them.");
  const allowed = Object.keys(patch).every(field => fields.includes(field));
  if (!allowed) throw new Error("Only well metadata fields can be edited.");
  const changes = checkedTargets(state, values).map(well => {
    const before = state.wells.find(record => record.well === well);
    const after = { ...normalizedMetadata({ ...before, ...patch }), well };
    const origin = state.provenance[well];
    return { well, before, after, provenance: after.role && after.role !== "unused" && origin ? { ...origin, manual: true } : null };
  });
  return plan(state, bulk ? "Edit selected wells" : "Edit well", changes);
}

export function previewClear(state, values, unused = false) {
  const changes = checkedTargets(state, values).map(well => ({ well, before: state.wells.find(record => record.well === well),
    after: { ...empty(well), role: unused ? "unused" : "" }, provenance: null }));
  return plan(state, unused ? "Mark wells unused" : "Clear well metadata", changes);
}

export function previewDeleteGroup(state, id, { removePlacements = false } = {}) {
  const group = findGroup(state, id);
  const changes = Object.entries(state.provenance).filter(([, origin]) => origin.groupId === id).map(([well]) => {
    const before = state.wells.find(record => record.well === well);
    return { well, before, after: removePlacements ? empty(well) : { ...before }, provenance: null };
  });
  return plan(state, `Delete ${group.code}${removePlacements ? " and clear its wells" : "; keep wells individually"}`, changes,
    { groups: state.groups.filter(item => item.id !== id) });
}

export function applyPlan(state, preview, { replaceExisting = false, allowSpill = false } = {}) {
  if (preview.revision !== state.revision) throw new Error("This review is out of date. Preview the change again.");
  if (preview.automatic && (!preview.valid || !preview.changes.length)) throw new Error(preview.errors[0]?.message || "Manual does not apply an automatic layout.");
  if (preview.replacementSelection && JSON.stringify([...state.selectedWells].sort(sortWells)) !== JSON.stringify(preview.replacementSelection)) throw new Error("Replacement selection changed. Preview the layout again.");
  if (preview.spills?.length && !allowSpill) throw new Error("Explicitly allow the listed perimeter/interior spill before applying.");
  if (preview.conflicts.length && !replaceExisting) throw new Error("Explicitly allow replacement of the listed occupied wells first.");
  const byWell = new Map(preview.changes.map(change => [change.well, change]));
  const provenance = { ...state.provenance };
  for (const change of preview.changes) {
    if (change.provenance) provenance[change.well] = { ...change.provenance };
    else delete provenance[change.well];
  }
  return commitWorkspace(state, { wells: state.wells.map(record => byWell.has(record.well) ? { ...byWell.get(record.well).after } : record),
    provenance, groups: preview.groups || state.groups }, preview.type);
}

export function planWarnings(state) {
  const warnings = [], targets = state.wells.filter(row => ["sample", "control"].includes(row.role));
  for (const group of state.groups) if (group.count > state.plateSize) warnings.push({ code: "group_capacity", text: `${group.code} requests ${group.count} wells on a ${state.plateSize}-well plate. Review its count.`, wells: [] });
  const blanks = state.wells.filter(row => row.role === "blank");
  const blankGroups = new Set(blanks.map(row => row.blank_group).filter(Boolean));
  const targetGroups = new Set(targets.map(row => row.blank_group).filter(Boolean));
  const add = (code, text, wells) => { if (wells.length) warnings.push({ code, text, wells }); };
  add("missing_identity", "Sample/control wells are missing strain or condition.", targets.filter(row => !row.strain || !row.condition).map(row => row.well));
  add("missing_blank_group", "Sample/control wells without a blank group will require No blank correction in the analyser.", targets.filter(row => !row.blank_group).map(row => row.well));
  add("blank_without_group", "Blank wells without a blank group will not be used for correction.", blanks.filter(row => !row.blank_group).map(row => row.well));
  for (const group of targetGroups) if (!blankGroups.has(group)) {
    const similar = [...blankGroups].filter(name => name.toLowerCase().replace(/\s/g, "") === group.toLowerCase().replace(/\s/g, ""));
    add("unmatched_blank_group", `No planned blanks match “${group}” exactly.${similar.length ? ` Similar name: ${similar.join(", ")}. Case and spacing matter.` : ""} Correction will require matching measured blanks or No blank correction.`, targets.filter(row => row.blank_group === group).map(row => row.well));
  }
  for (const group of blankGroups) if (!targetGroups.has(group)) add("unused_blank_group", `Blank group “${group}” is not used by a sample/control well.`, blanks.filter(row => row.blank_group === group).map(row => row.well));
  const replicateKeys = new Map(), identities = new Map();
  for (const row of [...targets, ...blanks]) {
    const key = JSON.stringify([row.role, row.strain, row.condition, row.role === "blank" ? row.blank_group : "", row.replicate_id]);
    if (!replicateKeys.has(key)) replicateKeys.set(key, []);
    replicateKeys.get(key).push(row.well);
  }
  for (const wells of replicateKeys.values()) add("duplicate_replicate", "Repeated replicate labels within the same role and biological identity; review individual labels.", wells.length > 1 ? wells : []);
  for (const row of targets) {
    const key = JSON.stringify([row.strain, row.condition]);
    if (!identities.has(key)) identities.set(key, []);
    identities.get(key).push(row);
  }
  for (const rows of identities.values()) {
    const groups = new Set(rows.map(row => state.provenance[row.well]?.groupId || "individual"));
    if (groups.size > 1 || new Set(rows.map(row => row.role)).size > 1) add("downstream_grouping", "The analyser summarizes these wells together by strain + condition, regardless of group code, role or blank group.", rows.map(row => row.well));
  }
  return warnings;
}
