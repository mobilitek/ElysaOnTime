import { describe, expect, test } from 'bun:test';
import { descriptionDocumentExportText, parseLegacyDescription } from './description-document';

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
});
