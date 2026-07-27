export type DescriptionLine = {
  id: string;
  text: string;
  depth: number;
  includedInExport: boolean;
};

const MAX_LINES = 500;
const MAX_DEPTH = 100;
const MAX_TEXT_LENGTH = 10_000;

export const normalizeDescriptionDocument = (
  value: DescriptionLine[] | null | undefined,
): DescriptionLine[] | null => {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > MAX_LINES) {
    throw new Error('Invalid description document');
  }
  const lines = value.map((line) => {
    if (
      !line
      || typeof line.id !== 'string'
      || !line.id.trim()
      || typeof line.text !== 'string'
      || !line.text.trim()
      || line.text.length > MAX_TEXT_LENGTH
      || !Number.isInteger(line.depth)
      || line.depth < 0
      || line.depth > MAX_DEPTH
      || typeof line.includedInExport !== 'boolean'
    ) {
      throw new Error('Invalid description document');
    }
    return {
      id: line.id.trim(),
      text: line.text.trim(),
      depth: line.depth,
      includedInExport: line.includedInExport,
    };
  });
  if (!lines.length || new Set(lines.map((line) => line.id)).size !== lines.length) {
    throw new Error('Invalid description document');
  }
  return lines;
};

export const descriptionDocumentText = (lines: DescriptionLine[]) =>
  lines.map((line) => `${'  '.repeat(line.depth)}- ${line.text}`).join('\n');

export const descriptionDocumentExportText = (lines: DescriptionLine[]) =>
  lines
    .filter((line) => line.includedInExport)
    .map((line) => `${'  '.repeat(line.depth)}- ${line.text}`)
    .join('\n');
