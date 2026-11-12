import { containsWell, isPerimeterWell, layoutWells, normalizeWell, sortWells } from "./plate.js";
import { groupStats, normalizedMetadata } from "./groups.js";
import { METADATA_FIELDS, hasMetadata } from "./workspace.js";

export const PLACEMENT_STRATEGIES = Object.freeze(["Manual", "Compact", "Avoid outer wells", "Use outer wells for blanks"]);
const empty = well => Object.fromEntries(METADATA_FIELDS.map(field => [field, field === "well" ? well : ""]));

function preferredRegion(strategy, role) {
  if (strategy === "Compact" || strategy === "Manual") return "any";
  if (role === "unused" || (strategy === "Use outer wells for blanks" && role === "blank")) return "perimeter";
  return "interior";
}

// A proposal is pure: even an explicit replan does not clear the source state.
export function previewAutomaticAssignment(state, strategy, { replacementWells = [] } = {}) {
  if (!PLACEMENT_STRATEGIES.includes(strategy)) throw new Error("Choose a supported layout strategy.");
  const byWell = new Map(state.wells.map(record => [record.well, record]));
  const selectedTargets = [...new Set(replacementWells.map(normalizeWell))];
  if (selectedTargets.some(well => !containsWell(state.plateSize, well))) throw new Error("Replacement targets must be valid wells on this plate.");
  const targets = new Set(selectedTargets.filter(well => hasMetadata(byWell.get(well))));
  const releasedState = { ...state, provenance: Object.fromEntries(Object.entries(state.provenance).filter(([well]) => !targets.has(well))) };
  const pending = new Map(state.groups.map(group => [group.id, groupStats(releasedState, group.id).remaining]));
  const blanks = state.groups.filter(group => group.role === "blank");
  const samples = state.groups.filter(group => ["sample", "control"].includes(group.role));
  const unused = state.groups.filter(group => group.role === "unused");
  const ordered = strategy === "Use outer wells for blanks" ? [...blanks, ...samples, ...unused]
    : [...state.groups.filter(group => group.role !== "unused"), ...unused];
  const records = ordered.flatMap(group => pending.get(group.id).map(index => ({ group, index })));
  const free = layoutWells(state.plateSize).filter(well => !hasMetadata(byWell.get(well)) || targets.has(well));
  const interior = free.filter(well => !isPerimeterWell(state.plateSize, well));
  const perimeter = free.filter(well => isPerimeterWell(state.plateSize, well));
  const byGroup = state.groups.map(group => ({ id: group.id, code: group.code, role: group.role,
    requested: group.count, placed: group.count - pending.get(group.id).length,
    remaining: pending.get(group.id).length, fits: 0, shortfall: 0 }));
  for (let index = 0; index < records.length; index += 1) {
    const row = byGroup.find(group => group.id === records[index].group.id);
    if (index < free.length) row.fits += 1; else row.shortfall += 1;
  }
  const byRole = ["sample", "control", "blank", "unused"].map(role => ({ role,
    remaining: byGroup.filter(group => group.role === role).reduce((sum, group) => sum + group.remaining, 0),
    shortfall: byGroup.filter(group => group.role === role).reduce((sum, group) => sum + group.shortfall, 0) }));
  const capacity = {
    requested: records.length, available: free.length, shortfall: Math.max(0, records.length - free.length),
    protected: state.wells.filter(row => hasMetadata(row) && !targets.has(row.well)).length, replanned: targets.size,
    interior: { available: interior.length, preferred: records.filter(item => preferredRegion(strategy, item.group.role) === "interior").length },
    perimeter: { available: perimeter.length, preferred: records.filter(item => preferredRegion(strategy, item.group.role) === "perimeter").length },
    byGroup, byRole
  };
  const result = { automatic: true, strategy, revision: state.revision, plateSize: state.plateSize,
    type: `Automatic layout: ${strategy}`, changes: [], conflicts: [], preserved: [], spills: [], errors: [],
    capacity, order: ordered.filter(group => pending.get(group.id).length).map(group => group.code),
    existingConstraints: [], valid: false,
    replacementSelection: targets.size ? [...state.selectedWells].sort(sortWells) : null };
  if (strategy === "Manual") return result;
  if (!records.length) {
    result.errors.push({ code: "nothing_to_place", message: "No remaining group wells to place. Save a group, increase its count, or explicitly replan selected group placements." });
    return result;
  }
  if (capacity.shortfall) {
    result.errors.push({ code: "insufficient_capacity", message: `${capacity.requested} wells requested, ${capacity.available} available: shortfall of ${capacity.shortfall}. No partial layout can be applied.` });
    return result;
  }
  for (const record of state.wells) {
    if (!hasMetadata(record) || targets.has(record.well) || !record.role) continue;
    const preferred = preferredRegion(strategy, record.role);
    const actual = isPerimeterWell(state.plateSize, record.well) ? "perimeter" : "interior";
    if (preferred !== "any" && preferred !== actual) result.existingConstraints.push({ well: record.well, role: record.role, preferred, actual });
  }
  const unusedSlots = new Set(free);
  const changes = new Map([...targets].map(well => [well, { well, before: byWell.get(well), after: empty(well), provenance: null }]));
  for (const { group, index } of records) {
    const preferred = preferredRegion(strategy, group.role);
    const pool = preferred === "interior" ? [...interior, ...perimeter]
      : preferred === "perimeter" ? [...perimeter, ...interior] : free;
    const well = pool.find(candidate => unusedSlots.has(candidate));
    unusedSlots.delete(well);
    const actual = isPerimeterWell(state.plateSize, well) ? "perimeter" : "interior";
    changes.set(well, { well, before: byWell.get(well),
      after: { well, ...normalizedMetadata({ ...group, replicate_id: String(index) }) },
      provenance: { groupId: group.id, index, manual: false } });
    if (preferred !== "any" && preferred !== actual) result.spills.push({ well, group: group.code, role: group.role,
      replicate_id: group.role === "unused" ? "" : String(index), preferred, actual });
  }
  result.changes = [...changes.values()].sort((left, right) => sortWells(left.well, right.well));
  result.conflicts = [...targets].sort(sortWells);
  result.valid = true;
  return result;
}
