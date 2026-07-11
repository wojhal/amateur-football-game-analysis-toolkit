import type { Table } from './tables';
import { downloadBlob, safeFileName } from './download';

/** exceljs is ~1 MB, so it's imported lazily on first use. */
export async function downloadXlsx(tables: Table[], projectName: string): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  for (const table of tables) {
    const ws = wb.addWorksheet(table.name);
    const headerRow = ws.addRow(table.header);
    headerRow.font = { bold: true };
    headerRow.border = { bottom: { style: 'thin' } };
    for (const row of table.rows) ws.addRow(row);
    for (let c = 1; c <= table.header.length; c++) {
      const col = ws.getColumn(c);
      let max = String(table.header[c - 1]).length;
      for (const row of table.rows) {
        max = Math.max(max, String(row[c - 1] ?? '').length);
      }
      col.width = Math.min(30, max + 2);
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${safeFileName(projectName)}-stats.xlsx`,
  );
}
