import { getPlateLayout } from "./plate.js";

export const ROLE_MARKS = Object.freeze({ sample: "S", control: "C", blank: "B", unused: "U", "": "—" });

// Derive keys from actual well values: manual overrides must never inherit an
// inaccurate group legend. Replicate identity remains on each individual well.
export function benchModel(snapshot) {
  const layout = getPlateLayout(snapshot.plateSize), entries = [], keys = new Map();
  const groups = new Map(snapshot.groups.map(group => [group.id, group]));
  const wells = snapshot.rows.map(row => {
    let code = "";
    if (row.role && row.role !== "unused") {
      const origin = snapshot.provenance[row.well]?.groupId || "";
      const key = JSON.stringify([origin, row.role, row.strain, row.condition, row.blank_group]);
      if (!keys.has(key)) {
        const entry = { code: `L${entries.length + 1}`, name: groups.get(origin)?.name || groups.get(origin)?.code || "Individual assignment",
          role: row.role, strain: row.strain, condition: row.condition, blank_group: row.blank_group, count: 0 };
        keys.set(key, entry); entries.push(entry);
      }
      const entry = keys.get(key); entry.count += 1; code = entry.code;
    }
    return { ...row, code, mark: ROLE_MARKS[row.role] };
  });
  const bands = snapshot.plateSize === 384 ? [[0, 8], [8, 16]] : [[0, layout.rows]];
  const maps = bands.map(([start, end]) => ({
    start: String.fromCharCode(65 + start), end: String.fromCharCode(64 + end),
    rows: Array.from({ length: end - start }, (_, index) => {
      const letter = String.fromCharCode(65 + start + index);
      return { letter, wells: wells.filter(row => row.well.startsWith(letter)) };
    })
  }));
  // Small legends can share map pages. Longer labels/counts get a full-width,
  // naturally paginated table, rather than forcing the map to shrink.
  const inlineLegend = entries.length <= 3 && entries.every(entry =>
    [entry.name, entry.strain, entry.condition, entry.blank_group].every(value => value.length <= 28 && !/[\r\n]/.test(value)));
  return { name: snapshot.name, plateSize: layout.size, columns: layout.columns, maps, entries, inlineLegend };
}
