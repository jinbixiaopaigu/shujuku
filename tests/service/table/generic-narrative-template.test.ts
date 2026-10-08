import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSheetInsertPlan } from '../../../src/data/sqlite/schema-mapper';

describe('generic narrative preset SQLite mapping', () => {
  for (let mask = 0; mask < 16; mask++) {
    const name = mask.toString(2).padStart(4, '0');
    it(`${name} maps every visible header to a DDL column`, () => {
      const url = new URL(`../../../templates/generic-narrative/generated/${name}.json`, import.meta.url);
      const template = JSON.parse(readFileSync(url, 'utf8'));
      for (const [key, sheet] of Object.entries(template) as [string, any][]) {
        if (!key.startsWith('sheet_')) continue;
        const mappings = createSheetInsertPlan(sheet).mappings;
        expect(mappings.map(mapping => mapping.sourceIndex).sort((a, b) => a - b), `${name}/${sheet.name}`)
          .toEqual(sheet.content[0].map((_: unknown, index: number) => index));
      }
    });
  }
});
