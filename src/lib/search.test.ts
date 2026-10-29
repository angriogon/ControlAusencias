import { describe, expect, it } from 'vitest';
import { matches } from './search';

describe('búsqueda', () => {
  it('no distingue tildes ni mayúsculas', () => {
    expect(matches('rios', 'ÁNGEL MANUEL RÍOS GOÑI')).toBe(true);
    expect(matches('GARCIA', 'Celia Aguilar García')).toBe(true);
    expect(matches('goñi', 'RIOS GONI')).toBe(true);
    expect(matches('', 'cualquiera')).toBe(true);
    expect(matches('madrid', 'Sevilla', undefined)).toBe(false);
  });
});
