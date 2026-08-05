export type DescriptionLine = {
  id: string;
  text: string;
  depth: number;
  includedInExport: boolean;
};

export const newDescriptionLine = (
  values: Partial<Omit<DescriptionLine, 'id'>> = {},
): DescriptionLine => ({
  id: crypto.randomUUID(),
  text: '',
  depth: 0,
  includedInExport: true,
  ...values,
});

export const newDescriptionLineAfter = (
  source: Pick<DescriptionLine, 'depth' | 'includedInExport'>,
): DescriptionLine => newDescriptionLine({
  depth: source.depth,
  includedInExport: source.includedInExport,
});

export const parseLegacyDescription = (description: string): DescriptionLine[] => {
  const parsed = description.split(/\r?\n/).flatMap((raw) => {
    if (!raw.trim()) return [];
    const prefix = /^([ \t]*)(-+)\s*(.*)$/.exec(raw);
    const whitespaceDepth = prefix
      ? [...prefix[1]!].reduce((depth, character) => depth + (character === '\t' ? 1 : 0.5), 0)
      : (/^[ \t]*/.exec(raw)?.[0] ?? '')
        .split('')
        .reduce((depth, character) => depth + (character === '\t' ? 1 : 0.5), 0);
    const hyphens = prefix?.[2]?.length ?? 0;
    const text = (prefix?.[3] ?? raw.trim()).trim();
    if (!text) return [];
    return [newDescriptionLine({
      text,
      depth: Math.max(0, Math.floor(whitespaceDepth) + Math.max(0, hyphens - 1)),
      // Conserver la règle historique de l'export : trois tirets indiquaient
      // déjà une note interne.
      includedInExport: hyphens < 3,
    })];
  });
  return parsed.length ? parsed : [newDescriptionLine()];
};

const descriptionLineText = (line: DescriptionLine) => {
  const indentation = '  '.repeat(line.depth);
  const [first = '', ...continuations] = line.text.trim().split(/\r?\n/);
  return [
    `${indentation}- ${first}`,
    ...continuations.map((text) => `${indentation}  ${text}`),
  ].join('\n');
};

export const descriptionDocumentText = (lines: DescriptionLine[]) =>
  lines
    .filter((line) => line.text.trim())
    .map(descriptionLineText)
    .join('\n');

export const descriptionDocumentFreeText = (lines: DescriptionLine[]) =>
  lines
    .filter((line) => line.text.trim())
    .map((line) => {
      const markerDepth = line.includedInExport ? line.depth + 1 : Math.max(3, line.depth + 1);
      return `${'-'.repeat(markerDepth)} ${line.text.trim()}`;
    })
    .join('\n');

export const descriptionDocumentExportText = (lines: DescriptionLine[]) =>
  descriptionDocumentText(lines.filter((line) => line.includedInExport));

export const descriptionDocumentForSave = (lines: DescriptionLine[]) =>
  lines
    .filter((line) => line.text.trim())
    .map((line) => ({ ...line, text: line.text.trim() }));

export const replaceLineWithPastedText = (
  lines: DescriptionLine[],
  index: number,
  pastedText: string,
  textBeforeCursor = '',
  textAfterCursor = '',
) => {
  const current = lines[index];
  if (!current || !/\r?\n/.test(pastedText)) return lines;
  const pasted = parseLegacyDescription(pastedText).map((line) => ({
    ...line,
    depth: current.depth + line.depth,
  }));
  const first = pasted[0]!;
  const last = pasted.at(-1)!;
  first.id = current.id;
  first.text = `${textBeforeCursor}${first.text}`;
  last.text = `${last.text}${textAfterCursor}`;
  return [...lines.slice(0, index), ...pasted, ...lines.slice(index + 1)];
};
