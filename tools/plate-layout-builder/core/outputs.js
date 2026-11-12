import { getPlateLayout, layoutWells, normalizeWell } from "./plate.js";
import { METADATA_FIELDS, ROLES, hasMetadata } from "./workspace.js";
import { groupStats, planWarnings } from "./groups.js";

function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === "object") freeze(child);
  return Object.freeze(value);
}

export function outputName(value) { return String(value ?? "").trim() || "Plate layout"; }

export function prepareOutput(state, name = "") {
  const errors = [], warnings = [];
  let layout;
  try { layout = getPlateLayout(state.plateSize); } catch (error) { errors.push(error.message); }
  if (outputName(name).length > 120) errors.push("Use a plate name of 120 characters or fewer.");
  const rows = state.wells.map(source => Object.fromEntries(METADATA_FIELDS.map(field => [field, source[field] == null ? "" : String(source[field])])));
  const seen = new Set(), expected = new Set(layout ? layoutWells(layout.size) : []);
  for (const row of rows) {
    const normalized = normalizeWell(row.well);
    if (!normalized || normalized !== row.well || !expected.has(row.well)) errors.push(`Invalid or out-of-layout well: ${row.well || "(blank)"}.`);
    if (seen.has(normalized)) errors.push(`Duplicate well: ${row.well}.`);
    seen.add(normalized);
    if (row.role && !ROLES.includes(row.role)) errors.push(`${row.well}: invalid role “${row.role}”.`);
    if (!row.role && hasMetadata(row)) errors.push(`${row.well}: partial metadata needs a role; assign it or clear the well.`);
    if (["sample", "control", "blank"].includes(row.role) && !/^[1-9]\d*$/.test(row.replicate_id)) errors.push(`${row.well}: replicate_id must be a positive whole-number label.`);
    if (row.role === "unused" && ["strain", "condition", "replicate_id", "blank_group"].some(field => row[field])) errors.push(`${row.well}: unused wells must have empty biological metadata and replicate_id.`);
  }
  if (layout && (rows.length !== layout.size || [...expected].some(well => !seen.has(well)))) errors.push(`The ${layout.size}-well plate must contain exactly one record for every well.`);
  if (errors.length) return { snapshot: null, errors: [...new Set(errors)], warnings, counts: null };
  const counts = Object.fromEntries([...ROLES, "unassigned"].map(role => [role, rows.filter(row => (row.role || "unassigned") === role).length]));
  counts.assigned = rows.length - counts.unassigned;
  warnings.push(...planWarnings(state).map(item => `${item.text}${item.wells.length ? ` Wells: ${item.wells.join(", ")}.` : ""}`));
  if (counts.unassigned) warnings.push(`${counts.unassigned} wells are unassigned and will have empty metadata. Importing these well-only rows clears any existing analyser metadata in those wells.`);
  for (const group of state.groups) {
    const remaining = groupStats(state, group.id).remaining.length;
    if (remaining) warnings.push(`${group.code}: ${remaining} of ${group.count} requested wells remain unplaced. Only actual well assignments are included.`);
  }
  const byWell = new Map(rows.map(row => [row.well, row]));
  const snapshot = freeze(structuredClone({ name: outputName(name), plateSize: layout.size,
    rows: layoutWells(layout.size).map(well => byWell.get(well)), groups: state.groups,
    provenance: state.provenance, revision: state.revision }));
  return { snapshot, errors, warnings: [...new Set(warnings)], counts };
}

// Same filename sanitation as the current analyser, with a Builder fallback.
export function outputFilename(name, extension) {
  const safe = String(name ?? "").trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^[._-]+|[._-]+$/g, "").slice(0, 100) || "plate_layout";
  return `${safe}_plate_metadata.${extension}`;
}

export function metadataCsv(snapshot) {
  const escape = value => /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  // SheetJS's array reader detects UTF-8 through this marker. Without it the
  // current analyser interprets non-ASCII CSV bytes using a legacy codepage.
  return "\uFEFF" + [METADATA_FIELDS.join(","), ...snapshot.rows.map(row => METADATA_FIELDS.map(field => escape(row[field])).join(","))].join("\n");
}
