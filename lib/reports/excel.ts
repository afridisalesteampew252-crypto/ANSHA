export type ExcelColumn = {
  header: string;
  key: string;
  width?: number;
};

/** Client-side .xlsx download via ExcelJS. */
export async function downloadRowsAsXlsx(opts: {
  filename: string;
  sheetName: string;
  columns: ExcelColumn[];
  rows: Record<string, string | number | boolean | null | undefined>[];
}) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ANSHA';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(opts.sheetName.slice(0, 31) || 'Report');
  sheet.columns = opts.columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? Math.min(40, Math.max(12, col.header.length + 4)),
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.commit();

  for (const row of opts.rows) {
    const normalized: Record<string, string | number | boolean | null> = {};
    for (const col of opts.columns) {
      const value = row[col.key];
      normalized[col.key] = value === undefined ? null : value;
    }
    sheet.addRow(normalized);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  const base = opts.filename.replace(/\.xlsx$/i, '');
  anchor.href = url;
  anchor.download = `${base}-${stamp}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
