// @vitest-environment jsdom

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createCanvasReadingPlaybackQueue, getCanvasSpeechText } from './text-to-speech-utils';

vi.mock('../../../hooks/useTextToSpeech', () => ({
  DEFAULT_TTS_SETTINGS: {
    selectedVoice: '',
    rate: 1,
    pitch: 1,
    volume: 1,
    voicesByLanguage: {},
  },
  inferSpeechLanguage: () => 'zh-CN',
  markdownToPlainText: (markdown: string) =>
    markdown
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
}));

vi.mock('../../card-element/CardElement', () => ({
  getCardBodyElement: vi.fn(),
}));

describe('getCanvasSpeechText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    const selection = window.getSelection();
    selection?.removeAllRanges();
    vi.clearAllMocks();
  });

  it('优先返回 Card 内部选中的文本', async () => {
    const { getCardBodyElement } = await import('../../card-element/CardElement');

    const container = document.createElement('div');
    container.innerHTML = '<p><span>第一段</span><span>第二段</span></p>';
    document.body.appendChild(container);
    vi.mocked(getCardBodyElement).mockReturnValue(container);

    const range = document.createRange();
    const textNode = container.querySelector('span')?.firstChild;
    if (!textNode) throw new Error('text node missing');
    range.setStart(textNode, 0);
    range.setEnd(textNode, 3);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const result = getCanvasSpeechText({} as never, [
      { id: 'card-1', type: 'card', body: '忽略整卡内容', title: '标题' } as never,
    ]);

    expect(result).toEqual({
      text: '第一段',
      title: '标题',
      sourceId: 'card:card-1:selection',
      origin: {
        kind: 'card',
        id: 'card-1',
      },
      source: 'selection',
    });
  });

  it('没有局部选区时回退到整卡 markdown 内容', async () => {
    const { getCardBodyElement } = await import('../../card-element/CardElement');
    vi.mocked(getCardBodyElement).mockReturnValue(null);

    const result = getCanvasSpeechText({} as never, [
      { id: 'card-1', type: 'card', title: '标题', body: '## 正文' } as never,
    ]);

    expect(result).toEqual({
      text: '标题\n\n正文',
      title: '标题',
      sourceId: 'card:card-1',
      origin: {
        kind: 'card',
        id: 'card-1',
      },
      source: 'element',
    });
  });

  it('拼接非 Card 元素提取出的文本', () => {
    const result = getCanvasSpeechText({} as never, [
      { id: 'text-1', type: 'text', text: '文本 A' } as never,
      {
        id: 'text-2',
        type: 'shape',
        data: [{ type: 'paragraph', children: [{ text: '文本 B' }] }],
      } as never,
    ]);

    expect(result).toEqual({
      text: '文本 A\n\n文本 B',
      title: '已选 2 个元素',
      sourceId: 'selection:text-1|text-2',
      origin: undefined,
      source: 'element',
    });
  });

  it('会将同画布其他 Card 一起加入朗读队列，并保留当前项内容', () => {
    const current = {
      text: '当前卡片选区',
      title: '当前卡片',
      source: 'selection' as const,
      sourceId: 'card:card-2:selection',
      origin: {
        kind: 'card' as const,
        id: 'card-2',
      },
    };

    const queue = createCanvasReadingPlaybackQueue(
      {
        children: [
          { id: 'card-1', type: 'card', title: '第一张', body: '第一张正文' },
          { id: 'card-2', type: 'card', title: '第二张', body: '第二张正文' },
          { id: 'shape-1', type: 'shape', text: '忽略' },
        ],
      } as never,
      current
    );

    expect(queue).toHaveLength(2);
    expect(queue.map((item) => item.title)).toEqual(['第一张', '当前卡片']);
    expect(queue[1]?.plainText).toBe('当前卡片选区');
  });
});
