import * as pdfjs from "./vendor/pdf.min.mjs";
import { itemsToLines, parseLines, totalsByCurrency, checks, fmt, buildXlsx } from "./core.js";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;

const $ = (id) => document.getElementById(id);
let blobUrl = null;

function show(el, cls, text) {
  el.replaceChildren();
  if (!text) return;
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  el.append(d);
}

async function handle(file) {
  $("result").hidden = true;
  if (!file) return;
  if (!/\.pdf$/i.test(file.name)) return show($("status"), "err", "Нужен файл в формате PDF.");
  show($("status"), "ok", "Обработка…");
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      pages.push(itemsToLines((await page.getTextContent()).items));
    }
    const res = parseLines(pages);
    if (!res.rows.length) return show($("status"), "err", 'В файле нет операций "Поступление перевода".');

    const buf = await buildXlsx(ExcelJS, res.rows);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(
      new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    );

    show($("status"), "", "");
    $("count").textContent = `Найдено поступлений переводов: ${res.rows.length}`;
    $("totals").replaceChildren(
      ...Object.entries(totalsByCurrency(res.rows)).map(([c, s]) => {
        const d = document.createElement("div");
        d.className = "total";
        d.textContent = `ИТОГО ${c}: ${fmt(s)}`;
        return d;
      })
    );
    $("checks").replaceChildren(
      ...checks(res).map((c) => {
        const d = document.createElement("div");
        d.className = c.ok ? "ok" : "warn";
        d.textContent = c.text;
        return d;
      })
    );
    const t = $("preview");
    t.replaceChildren();
    const addRow = (cells, tag, nums) => {
      const tr = document.createElement("tr");
      cells.forEach((v, i) => {
        const c = document.createElement(tag);
        c.textContent = v;
        if (nums.includes(i)) c.className = "n";
        tr.append(c);
      });
      t.append(tr);
    };
    addRow(["Дата операции", "Дата обработки", "Сумма операции", "Валюта", "Приход", "Счет/карта"], "th", []);
    const d = (x) => x.toISOString().slice(0, 10).split("-").reverse().join(".");
    res.rows.slice(0, 30).forEach((r) =>
      addRow([d(r.opDate), d(r.procDate), fmt(r.amount), r.currency, fmt(r.income), r.account], "td", [2, 4])
    );
    $("result").hidden = false;
  } catch (e) {
    show($("status"), "err", "Не удалось прочитать PDF: " + (e && e.message ? e.message : e));
  }
}

$("file").addEventListener("change", (e) => handle(e.target.files[0]));
$("dl").addEventListener("click", () => {
  if (!blobUrl) return;
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = "postupleniya_perevodov.xlsx";
  a.click();
});
