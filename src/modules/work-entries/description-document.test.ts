import { describe, expect, test } from 'bun:test';
import { descriptionDocumentExportText, parseLegacyDescription } from './description-document';
import { exportEntryDescriptionWithNotice, hasHiddenDescriptionLines, internalEntryNotice } from './export';

describe('legacy work-entry export normalization', () => {
  test('renders legacy and current hierarchy with the same bullet format', () => {
    const legacy = parseLegacyDescription([
      'Heures de travails selon mandat Garda / 5xperts',
      '- Code H:179',
      '-- Aviation Aces Daily ?',
      '',
      '- Travaux sur:',
      '- SSA-4620',
      '-- Ajustement et validation',
    ].join('\n'));

    expect(descriptionDocumentExportText(legacy)).toBe([
      '- Heures de travails selon mandat Garda / 5xperts',
      '- Code H:179',
      '  - Aviation Aces Daily ?',
      '- Travaux sur:',
      '- SSA-4620',
      '  - Ajustement et validation',
    ].join('\n'));
  });

  test('keeps the historical three-hyphen rule internal', () => {
    const legacy = parseLegacyDescription('- Visible\n-- Détail client\n--- Note interne');
    expect(descriptionDocumentExportText(legacy)).toBe('- Visible\n  - Détail client');
  });

  test('prepares a level-one notice only when an entry contains hidden lines', () => {
    expect(hasHiddenDescriptionLines('- Visible\n--- Note interne', null)).toBe(true);
    expect(hasHiddenDescriptionLines('- Visible', null)).toBe(false);
    expect(internalEntryNotice('en')).toBe([
      '-------------',
      'Some information has been intentionally hidden because it is marked as internal.',
      'When relevant and appropriate for disclosure, it may be provided upon request by an authorized representative.',
      'Some notes may, however, be strictly internal and not intended for disclosure.',
    ].join('\n'));
    expect(exportEntryDescriptionWithNotice(
      '- Visible\n--- Note interne',
      null,
      'en',
    )).toBe([
      '- Visible',
      '',
      '-------------',
      'Some information has been intentionally hidden because it is marked as internal.',
      'When relevant and appropriate for disclosure, it may be provided upon request by an authorized representative.',
      'Some notes may, however, be strictly internal and not intended for disclosure.',
    ].join('\n'));
  });
});
