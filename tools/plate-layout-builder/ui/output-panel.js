import { prepareOutput, metadataCsv, outputFilename } from "../core/outputs.js";
import { buildMetadataWorkbook } from "../io/metadata-workbook.js";
import { renderBenchView } from "./bench-view.js";

const $ = selector => document.querySelector(selector);
function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type })), link = document.createElement("a");
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function createOutputPanel({ getState, isDraftDirty, announce }) {
  const dialog = $("#output-dialog"), confirm = $("#confirm-output"), acknowledgement = $("#acknowledge-output");
  let pending = null, returnFocus = null, busy = false;
  function ready() {
    confirm.disabled = busy || !pending?.snapshot || (pending.warnings.length > 0 && !acknowledgement.checked);
    $("#cancel-output").disabled = busy;
    acknowledgement.disabled = busy;
  }
  function begin(kind) {
    returnFocus = document.activeElement;
    const review = prepareOutput(getState(), $("#plate-name").value);
    if (kind === "csv") review.warnings.push("CSV preserves literal values for analyser import, but has no cell types, formatting or dropdowns. Spreadsheet applications may reinterpret numeric/date-like labels or formula-like text when opening CSV directly. Choose .xlsx for spreadsheet editing.");
    if (isDraftDirty()) review.warnings.push("The group editor has an unsaved draft. Only saved definitions and actual well assignments are included; cancel to save or discard the draft first.");
    pending = { ...review, kind, name: $("#plate-name").value };
    $("#output-title").textContent = kind === "bench" ? "Review bench view" : `Review ${kind.toUpperCase()} metadata export`;
    $("#output-summary").textContent = review.counts ? `${review.snapshot.name} · ${review.snapshot.plateSize}-well plate · ${review.snapshot.rows.length} metadata rows. Sample: ${review.counts.sample}; control: ${review.counts.control}; blank: ${review.counts.blank}; unused: ${review.counts.unused}; unassigned: ${review.counts.unassigned}.` : "Fix the errors below before continuing.";
    for (const [selector, messages] of [["#output-errors", review.errors], ["#output-warnings", review.warnings]]) {
      $(selector).replaceChildren(...messages.map(message => { const item = document.createElement("li"); item.textContent = message; return item; }));
    }
    $("#output-error").textContent = ""; acknowledgement.checked = false;
    $("#output-ack-label").hidden = !review.warnings.length;
    confirm.textContent = kind === "bench" ? "Open bench view" : `Download .${kind}`;
    ready(); dialog.showModal();
  }
  function fresh() {
    if (!pending || pending.snapshot.revision !== getState().revision || pending.name !== $("#plate-name").value) throw new Error("The layout or plate name changed. Cancel and review a fresh snapshot.");
  }
  confirm.addEventListener("click", async () => {
    if (confirm.disabled) return;
    try {
      busy = true; ready(); fresh();
      const { snapshot, kind, name } = pending;
      if (kind === "bench") {
        renderBenchView($("#bench-pages"), snapshot);
        document.body.classList.add("plb-show-bench");
        $("#workspace-content").hidden = true; $("#bench-view").hidden = false;
        dialog.close(); $("#bench-back").focus();
        announce("Bench view opened from the reviewed plate snapshot. Use Print / Save as PDF or return to editing.");
      } else {
        const data = kind === "xlsx" ? await buildMetadataWorkbook(window.ExcelJS, snapshot).xlsx.writeBuffer() : metadataCsv(snapshot);
        fresh();
        download(data, outputFilename(name, kind), kind === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=utf-8");
        dialog.close(); announce(`${kind.toUpperCase()} metadata downloaded for the ${snapshot.plateSize}-well plate.`);
      }
    } catch (error) { $("#output-error").textContent = error.message; announce(error.message); }
    finally { busy = false; ready(); }
  });
  acknowledgement.addEventListener("change", ready);
  $("#cancel-output").addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => { if (!document.body.classList.contains("plb-show-bench")) returnFocus?.focus({ preventScroll: true }); });
  for (const kind of ["xlsx", "csv", "bench"]) $("#output-" + kind).addEventListener("click", () => begin(kind));
  $("#bench-back").addEventListener("click", () => {
    $("#bench-view").hidden = true; $("#workspace-content").hidden = false; document.body.classList.remove("plb-show-bench");
    $("#bench-pages").replaceChildren(); $("#output-bench").focus(); announce("Returned to the unchanged, editable plate workspace.");
  });
  $("#bench-print").addEventListener("click", () => window.print());
  return { enable() { for (const kind of ["xlsx", "csv", "bench"]) $("#output-" + kind).disabled = false; } };
}
