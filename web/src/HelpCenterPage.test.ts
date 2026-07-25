import { describe, expect, test } from 'bun:test';
import { CURRENT_VERSION, HELP_CONTENT } from './HelpCenterPage';

describe('bilingual help center content', () => {
  test('provides a complete manual in both supported languages', () => {
    expect(HELP_CONTENT.fr.manualSections.length).toBeGreaterThanOrEqual(10);
    expect(HELP_CONTENT.en.manualSections.length).toBe(HELP_CONTENT.fr.manualSections.length);
  });

  test('provides contextual help for every application area', () => {
    const contexts = ['worklog', 'clients', 'projects', 'profile', 'admin', 'subscription'] as const;
    for (const context of contexts) {
      expect(HELP_CONTENT.fr.pageHelp[context][1].length).toBeGreaterThan(0);
      expect(HELP_CONTENT.en.pageHelp[context][1].length).toBeGreaterThan(0);
    }
  });

  test('documents the current version with user-facing improvements', () => {
    expect(CURRENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(HELP_CONTENT.fr.improvements.length).toBeGreaterThanOrEqual(8);
    expect(HELP_CONTENT.en.improvements.length).toBe(HELP_CONTENT.fr.improvements.length);
  });
});
