import { describe, expect, it } from 'vitest';
import { markdownToPlainText } from './useTextToSpeech';

describe('markdownToPlainText', () => {
  it('removes common markdown markers and keeps readable text', () => {
    const markdown = [
      '# 标题',
      '',
      '这是**加粗**和`代码`。',
      '',
      '- 列表项',
      '',
      '[链接文本](https://example.com)',
      '',
      '![插图](https://example.com/image.png)',
    ].join('\n');

    expect(markdownToPlainText(markdown)).toBe(
      ['标题', '', '这是加粗和代码。', '列表项', '', '链接文本', '', '插图'].join(
        '\n'
      )
    );
  });
});
