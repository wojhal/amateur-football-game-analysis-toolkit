import type { Table } from './tables';
import { downloadText, safeFileName } from './download';

function csvEscape(cell: string | number): string {
  const s = String(cell);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function tableToCsv(table: Table): string {
  const lines = [table.header.map(csvEscape).join(',')];
  for (const row of table.rows) lines.push(row.map(csvEscape).join(','));
  return lines.join('\r\n');
}

export function downloadCsv(table: Table, projectName: string): void {
  downloadText(
    tableToCsv(table),
    `${safeFileName(projectName)}-${table.name.toLowerCase()}.csv`,
    'text/csv;charset=utf-8',
  );
}
