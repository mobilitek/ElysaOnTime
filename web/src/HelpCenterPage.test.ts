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

  test('documents a bilingual release history including the current version', () => {
    expect(CURRENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(HELP_CONTENT.fr.releases.length).toBeGreaterThanOrEqual(2);
    expect(HELP_CONTENT.en.releases.length).toBe(HELP_CONTENT.fr.releases.length);
    expect(HELP_CONTENT.fr.releases[0].version).toBe(CURRENT_VERSION);
    expect(HELP_CONTENT.en.releases[0].version).toBe(CURRENT_VERSION);
    for (const release of HELP_CONTENT.fr.releases) {
      expect(release.changes.length).toBeGreaterThan(0);
    }
  });
});
