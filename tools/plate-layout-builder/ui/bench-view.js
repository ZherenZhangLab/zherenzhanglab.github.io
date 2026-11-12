import { benchModel } from "../core/bench.js";

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function legend(model, compact = false) {
  const section = node("section", null, "plb-bench-legend");
  section.append(node("h2", `${model.name} — assignment key`));
  if (!compact) section.append(node("p", `${model.plateSize}-well plate. L codes identify actual metadata; replicate IDs are printed in each well. Empty fields are shown as —.`));
  const table = node("table"), head = node("thead"), headings = node("tr");
  ["Code", "Group label", "Role", "Strain", "Condition", "Blank group", "Wells"].forEach(text => headings.append(node("th", text)));
  head.append(headings); table.append(head);
  const body = node("tbody");
  for (const entry of model.entries) {
    const row = node("tr");
    [entry.code, entry.name, entry.role, entry.strain, entry.condition, entry.blank_group, entry.count].forEach(text => row.append(node("td", text === "" ? "—" : text)));
    body.append(row);
  }
  table.append(body); section.append(table);
  if (!model.entries.length) section.append(node("p", "No sample, control or blank assignments. U = unused; — = unassigned."));
  return section;
}

export function renderBenchView(container, snapshot) {
  const model = benchModel(snapshot); container.replaceChildren();
  model.maps.forEach((map, index) => {
    const page = node("section", null, "plb-bench-page"); page.dataset.size = model.plateSize;
    const header = node("header"); header.append(node("h1", model.name));
    header.append(node("p", `${model.plateSize}-well plate · Rows ${map.start}–${map.end}, columns 1–${model.columns} · Map ${index + 1}/${model.maps.length}`));
    header.append(node("p", `Orientation: A1 is the plate’s top-left well. Rows run down ↓; columns run right →.${index ? " This page continues at I1, directly below H1." : ""}`));
    page.append(header);
    const table = node("table", null, "plb-bench-map"); table.setAttribute("aria-label", `Bench plate map, rows ${map.start} to ${map.end}`);
    const head = node("thead"), headings = node("tr"); headings.append(node("th", "↓→"));
    for (let column = 1; column <= model.columns; column += 1) headings.append(node("th", column));
    head.append(headings); table.append(head);
    const body = node("tbody");
    for (const row of map.rows) {
      const tr = node("tr"), label = node("th", row.letter); label.scope = "row"; tr.append(label);
      for (const well of row.wells) {
        const cell = node("td"); cell.dataset.well = well.well; cell.dataset.role = well.role || "unassigned";
        cell.append(node("span", well.well, "plb-bench-coordinate"));
        cell.append(node("strong", well.code || well.mark));
        const shortLabel = well.strain || well.condition;
        if (model.plateSize <= 48 && shortLabel && shortLabel.length <= 12 && !/[\r\n]/.test(shortLabel)) cell.append(node("span", shortLabel, "plb-bench-coordinate"));
        cell.append(node("span", well.replicate_id ? `${well.mark} · ${well.replicate_id}` : well.role === "unused" ? "unused" : model.plateSize === 384 ? "" : "unassigned", "plb-bench-replicate"));
        tr.append(cell);
      }
      body.append(tr);
    }
    table.append(body); page.append(table);
    page.append(node("p", "S = sample · C = control (double border) · B = blank (dashed border) · U = unused (hatched) · — = unassigned. The number after S/C/B is the replicate ID.", "plb-bench-role-key"));
    if (model.inlineLegend) page.append(legend(model, true));
    else page.append(node("p", "Full strain, condition and blank-group details follow in the assignment key. L codes describe this printout only; they are not metadata fields."));
    container.append(page);
  });
  if (!model.inlineLegend) container.append(legend(model));
}
