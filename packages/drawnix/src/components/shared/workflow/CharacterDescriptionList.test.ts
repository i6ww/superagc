import { describe, expect, it } from 'vitest';
import { estimateCharacterDescriptionRows } from './CharacterDescriptionList';

describe('CharacterDescriptionList helpers', () => {
  it('estimates rows for multiline content', () => {
    expect(estimateCharacterDescriptionRows('')).toBe(1);
    expect(estimateCharacterDescriptionRows('单行内容')).toBe(1);
    expect(estimateCharacterDescriptionRows('第一行\n第二行内容')).toBe(2);
  });

  it('expands rows for long lines', () => {
    expect(estimateCharacterDescriptionRows('a'.repeat(31), 30)).toBe(2);
  });
});
