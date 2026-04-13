import { describe, expect, it } from 'vitest';
import { extractTextFromElement } from '../selection-utils';

describe('selection-utils', () => {
  describe('extractTextFromElement', () => {
    it('应该将 markdown card 的标题和正文作为文本提取', () => {
      const result = extractTextFromElement({
        id: 'card-1',
        type: 'card',
        title: '需求总结',
        body: '## 正文\n- 第一条\n- 第二条',
        fillColor: '#fff',
        points: [
          [0, 0],
          [100, 100],
        ],
        children: [],
      } as any);

      expect(result).toBe('需求总结\n\n## 正文\n- 第一条\n- 第二条');
    });

    it('应该在 card 没有标题时仍提取 markdown 正文', () => {
      const result = extractTextFromElement({
        id: 'card-2',
        type: 'card',
        body: '只保留正文',
        fillColor: '#fff',
        points: [
          [0, 0],
          [100, 100],
        ],
        children: [],
      } as any);

      expect(result).toBe('只保留正文');
    });
  });
});
