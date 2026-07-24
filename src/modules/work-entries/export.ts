import ExcelJS from 'exceljs';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { database } from '../../database';
import { clients, projects, workEntries } from '../../db/schema';

type ExportOptions = { from: string; to: string; clientId?: string; projectId?: string; includeDeleted: boolean; confidential: boolean; language: 'fr' | 'en' };
type ExportUser = { id: string; firstName: string; lastName: string };

const labels = {
  client: 'Client',
  project: 'Project',
  day: 'Day',
  date: 'Date',
  description: 'Description',
  hours: 'Hours',
  rate: 'Rate',
  value: 'Value',
  total: 'Total',
  allClients: 'AllClient',
  days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
} as const;

const excelDate = (value: string) => new Date(`${value}T00:00:00Z`);
const filenamePart = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\\/:*?"<>|]+/g, '-')
  .replace(/\s+/g, ' ')
  .trim();
const filenameDate = (value: string) => { const [year, month, day] = value.split('-'); return `${day}-${month}-${year}`; };
export const exportDescription = (description: string) => description
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith('---'))
  .join('\n');

export const exportWorkEntries = async (user: ExportUser, options: ExportOptions) => {
  const conditions = [eq(workEntries.userId, user.id), eq(clients.userId, user.id), eq(clients.isActive, true), eq(projects.isActive, true), gte(workEntries.workDate, options.from), lte(workEntries.workDate, options.to)];
  if (options.clientId) conditions.push(eq(clients.id, options.clientId));
  if (options.projectId) conditions.push(eq(projects.id, options.projectId));
  if (!options.includeDeleted) conditions.push(eq(workEntries.isDeleted, false));
  const rows = await database.select({ clientName: clients.name, projectName: projects.name, workDate: workEntries.workDate, durationMinutes: workEntries.durationMinutes, description: workEntries.description, hourlyRate: workEntries.hourlyRate, amount: workEntries.amount })
    .from(workEntries).innerJoin(projects, eq(workEntries.projectId, projects.id)).innerJoin(clients, eq(projects.clientId, clients.id)).where(and(...conditions)).orderBy(desc(workEntries.workDate), desc(workEntries.createdAt));

  const text = labels; const showClient = !options.clientId; const showProject = !options.projectId;
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'OnTime'; workbook.created = new Date();
  const sheet = workbook.addWorksheet('A');
  sheet.properties.defaultRowHeight = 15;
  const columns: Partial<ExcelJS.Column>[] = [];
  if (showClient) columns.push({ header: text.client, key: 'client', width: 25 });
  if (showProject) columns.push({ header: text.project, key: 'project', width: 30 });
  columns.push(
    { header: text.day, key: 'day', width: 11.71428571429 },
    { header: text.date, key: 'date', width: 14.14285714286 },
    { header: text.description, key: 'description', width: 40.28571428571 },
    { header: text.hours, key: 'hours', width: 10 },
  );
  if (!options.confidential) columns.push({ header: text.rate, key: 'rate', width: 14 }, { header: text.value, key: 'value', width: 16 });
  sheet.columns = columns;
  for (const row of rows) {
    const date = excelDate(row.workDate); const value: Record<string, unknown> = { day: text.days[date.getUTCDay()], date, description: exportDescription(row.description), hours: row.durationMinutes / 1440 };
    if (showClient) value.client = row.clientName; if (showProject) value.project = row.projectName;
    if (!options.confidential) { value.rate = Number(row.hourlyRate); value.value = Number(row.amount); }
    sheet.addRow(value);
  }
  if (!options.confidential && rows.length) {
    const totalHours = rows.reduce((sum, row) => sum + row.durationMinutes, 0) / 1440;
    const totalValue = rows.reduce((sum, row) => sum + Number(row.amount), 0);
    const totalRow = sheet.addRow({ description: text.total, hours: { formula: `SUM(${sheet.getColumn('hours').letter}2:${sheet.getColumn('hours').letter}${rows.length + 1})`, result: totalHours }, value: { formula: `SUM(${sheet.getColumn('value').letter}2:${sheet.getColumn('value').letter}${rows.length + 1})`, result: totalValue } });
    totalRow.font = { bold: true, color: { argb: 'FF17324D' } }; totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3FF' } };
  }
  sheet.eachRow((row) => { row.font = { name: 'Arial', size: 10 }; });
  const header = sheet.getRow(1); header.alignment = { horizontal: 'center', vertical: 'bottom' };
  sheet.getColumn('date').numFmt = 'dd/mm/yyyy'; sheet.getColumn('date').alignment = { horizontal: 'center', vertical: 'top' };
  sheet.getColumn('hours').numFmt = 'HH:mm'; sheet.getColumn('hours').alignment = { horizontal: 'center', vertical: 'top' };
  sheet.getColumn('description').alignment = { horizontal: 'left', vertical: 'top', wrapText: false };
  if (!options.confidential) { sheet.getColumn('rate').numFmt = '"$"#,##0.00'; sheet.getColumn('value').numFmt = '"$"#,##0.00'; }
  for (let row = 2; row <= sheet.rowCount; row += 1) {
    sheet.getRow(row).height = 15;
    sheet.getRow(row).eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { ...cell.alignment, vertical: 'top' };
    });
  }
  let selectedClient: string = text.allClients;
  if (options.clientId) {
    const [client] = await database.select({ name: clients.name }).from(clients).where(and(eq(clients.id, options.clientId), eq(clients.userId, user.id))).limit(1);
    selectedClient = client?.name ?? text.allClients;
  }
  const filename = `${filenamePart(`${user.firstName}${user.lastName}`)}_OnTime_${filenamePart(selectedClient)}_${filenameDate(options.from)}_to_${filenameDate(options.to)}.xlsx`;
  return { buffer: await workbook.xlsx.writeBuffer(), filename, rows };
};
