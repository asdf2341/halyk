// Разбор выписки и сборка Excel. Без DOM, чтобы можно было тестировать.
export const TRANSFER_PREFIXES = ["Поступление перевода"]; // добавьте сюда другие типы приходов при необходимости
const nospace = (s) => s.replace(/\s+/g, "");
const PREFIXES = TRANSFER_PREFIXES.map(nospace);

const NUM = "-?\\d[\\d\\s]*,\\d{2}";
const ROW_RE = new RegExp(
  `^(\\d{2}\\.\\d{2}\\.\\d{4})\\s+(\\d{2}\\.\\d{2}\\.\\d{4})\\s+(.+?)\\s+(${NUM})\\s+([A-Z]{3})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(\\S+)`
);
const TOTAL_RE = new RegExp(`^([A-Z]{3})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s*$`);

// число -> целое количество тиын (без ошибок плавающей точки)
const cents = (s) => Math.round(parseFloat(s.replace(/\s+/g, "").replace(",", ".")) * 100);
const toDate = (s) => {
  const [d, m, y] = s.split(".").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// items: элементы textContent страницы pdf.js -> строки текста
export function itemsToLines(items) {
  const its = items
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5] }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  let cur = null;
  for (const it of its) {
    if (cur && Math.abs(cur.y - it.y) <= 2.5) cur.parts.push(it);
    else lines.push((cur = { y: it.y, parts: [it] }));
  }
  return lines.map((l) =>
    l.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ").replace(/\s+/g, " ").trim()
  );
}

// pages: массив массивов строк
export function parseLines(pages) {
  const rows = [];
  const allIncome = {};
  const bankTotals = {};
  let text = 0;
  for (const lines of pages) {
    for (const line of lines) {
      text++;
      const m = ROW_RE.exec(line);
      if (m) {
        const cur = m[5];
        const income = cents(m[6]);
        allIncome[cur] = (allIncome[cur] || 0) + income;
        if (PREFIXES.some((p) => nospace(m[3]).startsWith(p))) {
          rows.push({
            opDate: toDate(m[1]), procDate: toDate(m[2]),
            amount: cents(m[4]), currency: cur, income, account: m[9],
          });
        }
        continue;
      }
      const t = TOTAL_RE.exec(line);
      if (t && !(t[1] in bankTotals)) bankTotals[t[1]] = cents(t[2]);
    }
  }
  if (!text) throw new Error("В PDF не найден текст (возможно, это скан). Нужен PDF, скачанный из банка.");
  return { rows, allIncome, bankTotals };
}

export function totalsByCurrency(rows) {
  const r = {};
  for (const x of rows) r[x.currency] = (r[x.currency] || 0) + x.income;
  return r;
}

export const fmt = (c) =>
  (c / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function checks({ allIncome, bankTotals }) {
  return Object.entries(bankTotals).map(([cur, bank]) => {
    const mine = allIncome[cur] || 0;
    return mine === bank
      ? { ok: true, text: `Сверка с итогом банка (${cur}): совпадает (${fmt(bank)})` }
      : { ok: false, text: `ВНИМАНИЕ: сверка (${cur}) не совпала: по строкам ${fmt(mine)}, в выписке ${fmt(bank)}. Проверьте файл.` };
  });
}

export async function buildXlsx(ExcelJS, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Поступления переводов", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Дата операции", width: 16 }, { header: "Дата обработки", width: 16 },
    { header: "Сумма операции", width: 18 }, { header: "Валюта", width: 10 },
    { header: "Приход", width: 18 }, { header: "Счет/карта", width: 26 },
  ];
  const head = ws.getRow(1);
  head.height = 28;
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  for (const r of rows) {
    const row = ws.addRow([r.opDate, r.procDate, r.amount / 100, r.currency, r.income / 100, r.account]);
    row.getCell(1).numFmt = row.getCell(2).numFmt = "dd.mm.yyyy";
    row.getCell(3).numFmt = row.getCell(5).numFmt = "#,##0.00";
  }
  const last = rows.length + 1;
  const sums = totalsByCurrency(rows);
  const curs = Object.keys(sums).sort();
  ws.addRow([]);
  for (const cur of curs) {
    const n = ws.rowCount + 1;
    const amt = rows.filter((r) => r.currency === cur).reduce((a, r) => a + r.amount, 0) / 100;
    const row = ws.addRow([
      curs.length === 1 ? "ИТОГО" : `ИТОГО (${cur})`, null,
      { formula: `SUMIF($D$2:$D$${last},D${n},C2:C${last})`, result: amt },
      cur,
      { formula: `SUMIF($D$2:$D$${last},D${n},E2:E${last})`, result: sums[cur] / 100 },
    ]);
    row.font = { bold: true };
    row.getCell(3).numFmt = row.getCell(5).numFmt = "#,##0.00";
    row.eachCell({ includeEmpty: true }, (c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } }));
  }
  const cnt = ws.addRow(["Количество операций", null, rows.length]);
  cnt.font = { bold: true };
  if (rows.length) ws.autoFilter = `A1:F${last}`;
  return wb.xlsx.writeBuffer();
}
