import { describe, expect, test } from 'bun:test';
import ExcelJS from 'exceljs';
import { InvalidImportFileError, parseImportFile } from './service';

const workbookFile = async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Export');
  sheet.addRow(['Client', 'Project', 'Day', 'Date', 'Rate', 'Value', 'Description', 'Hours', 'Billed']);
  sheet.addRow(['Mobilitek', 'OnTime', 'Monday', new Date('2026-07-20T00:00:00Z'), 100, 0, 'Planning', 0, 0]);
  sheet.addRow(['Mobilitek', 'OnTime', 'Tuesday', new Date('2026-07-21T00:00:00Z'), -125, -250, 'Correction', 120 / 1440, 1]);
  sheet.addRow(['Mobilitek', 'OnTime', 'Tuesday', new Date('2026-07-21T00:00:00Z'), -125, -250, 'Correction', 120 / 1440, 1]);
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], 'export.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

describe('Excel data import', () => {
  test('analyzes historical exceptions and distinguishes exact duplicates', async () => {
    const { entries, analysis } = await parseImportFile(await workbookFile());
    expect(analysis.clients).toBe(1);
    expect(analysis.projects).toBe(1);
    expect(analysis.entries).toBe(3);
    expect(analysis.zeroMinuteEntries).toBe(1);
    expect(analysis.negativeRateEntries).toBe(2);
    expect(analysis.duplicateRows).toBe(2);
    expect(entries.map((entry) => entry.description)).toEqual(['Planning', 'Correction-1', 'Correction-2']);
    expect(analysis.digest).toHaveLength(64);
  });

  test('rejects files that are not XLSX workbooks', async () => {
    await expect(parseImportFile(new File(['invalid'], 'export.csv'))).rejects.toBeInstanceOf(InvalidImportFileError);
  });
});
