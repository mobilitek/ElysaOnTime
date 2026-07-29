import { describe, expect, test } from 'bun:test';
import { databaseTarget, explainDatabaseError } from './database-diagnostics';

describe('database startup diagnostics', () => {
  test('describes a target without exposing its password', () => {
    const target = databaseTarget('postgresql://ontime:secret@192.168.2.139:5432/ontime_dev');

    expect(target).toEqual({
      database: 'ontime_dev',
      host: '192.168.2.139',
      port: '5432',
      user: 'ontime',
    });
    expect(JSON.stringify(target)).not.toContain('secret');
  });

  test('explains common connection and authentication failures', () => {
    expect(explainDatabaseError(Object.assign(new Error(), { code: 'ECONNREFUSED' })))
      .toContain('Connexion refusée');
    expect(explainDatabaseError(Object.assign(new Error(), { code: '28P01' })))
      .toContain('Authentification');
    expect(explainDatabaseError(Object.assign(new Error(), { code: '3D000' })))
      .toContain('n’existe pas');
  });
});
