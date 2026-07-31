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

export const parseLegacyDescription = (description: string): DescriptionLine[] =>
  description.split(/\r?\n/).flatMap((raw, index) => {
    if (!raw.trim()) return [];
    const prefix = /^([ \t]*)(-+)\s*(.*)$/.exec(raw);
    const whitespace = prefix?.[1] ?? (/^[ \t]*/.exec(raw)?.[0] ?? '');
    const whitespaceDepth = [...whitespace]
      .reduce((depth, character) => depth + (character === '\t' ? 1 : 0.5), 0);
    const hyphens = prefix?.[2]?.length ?? 0;
    const text = (prefix?.[3] ?? raw.trim()).trim();
    if (!text) return [];
    return [{
      id: `legacy-${index}`,
      text,
      depth: Math.max(0, Math.floor(whitespaceDepth) + Math.max(0, hyphens - 1)),
      includedInExport: hyphens < 3,
    }];
  });

const descriptionLineText = (line: DescriptionLine) => {
  const indentation = '  '.repeat(line.depth);
  const [first = '', ...continuations] = line.text.split(/\r?\n/);
  return [
    `${indentation}- ${first}`,
    ...continuations.map((text) => `${indentation}  ${text}`),
  ].join('\n');
};

export const descriptionDocumentText = (lines: DescriptionLine[]) =>
  lines.map(descriptionLineText).join('\n');

export const descriptionDocumentExportText = (lines: DescriptionLine[]) =>
  lines
    .filter((line) => line.includedInExport)
    .map(descriptionLineText)
    .join('\n');
