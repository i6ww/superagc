/**
 * assetEmbed ProseMirror 节点 schema
 *
 * 存储 assetId / assetType / label，
 * toMarkdown 还原为 ![type|label](asset://id) 标准图片语法。
 */
import { $nodeSchema } from '@milkdown/kit/utils';
import { ASSET_URI_PREFIX } from '../../../utils/markdown-asset-embeds';

export const assetEmbedSchema = $nodeSchema('assetEmbed', () => ({
  inline: false,
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,
  attrs: {
    assetId: { default: '' },
    assetType: { default: 'image' },
    label: { default: '' },
  },
  parseMarkdown: {
    match: ({ type }: { type: string }) => type === 'assetEmbed',
    runner: (state: any, node: any, type: any) => {
      state.addNode(type, {
        assetId: node.assetId as string,
        assetType: node.assetType as string,
        label: node.label as string,
      });
    },
  },
  toMarkdown: {
    match: (node: any) => node.type.name === 'assetEmbed',
    runner: (state: any, node: any) => {
      const { assetId, assetType, label } = node.attrs;
      const alt = label ? `${assetType}|${label}` : assetType;
      state.addNode('image', undefined, undefined, {
        url: `${ASSET_URI_PREFIX}${assetId}`,
        alt,
      });
    },
  },
  toDOM: (node: any) => [
    'div',
    {
      'data-type': 'asset-embed',
      'data-asset-id': node.attrs.assetId,
      'data-asset-type': node.attrs.assetType,
      'data-label': node.attrs.label,
    },
  ],
  parseDOM: [
    {
      tag: 'div[data-type="asset-embed"]',
      getAttrs: (dom: HTMLElement) => ({
        assetId: dom.getAttribute('data-asset-id') || '',
        assetType: dom.getAttribute('data-asset-type') || 'image',
        label: dom.getAttribute('data-label') || '',
      }),
    },
  ],
}));
