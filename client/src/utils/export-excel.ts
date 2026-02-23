import * as XLSX from 'xlsx';

export function exportToExcel(data: any[], columns: { title: string; key: string }[], filename: string) {
  const rows = data.map(row =>
    columns.reduce((acc, col) => {
      acc[col.title] = row[col.key] ?? '';
      return acc;
    }, {} as Record<string, any>),
  );
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
