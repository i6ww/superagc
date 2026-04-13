import { ToolCategory, ToolDefinition } from '../types/toolbox.types';
import { toolRegistry } from '../tools/registry';

export const BUILT_IN_TOOLS: ToolDefinition[] = toolRegistry.getBuiltInTools();

/**
 * 默认工具配置
 */
export const DEFAULT_TOOL_CONFIG = {
  /** 默认宽度（画布单位） */
  defaultWidth: 600,

  /** 默认高度（画布单位） */
  defaultHeight: 400,

  /** 默认 iframe 权限 */
  defaultPermissions: [
    'allow-scripts',
    'allow-same-origin',
    'allow-popups',
    'allow-forms',
    'allow-top-navigation-by-user-activation'
  ] as string[],
};

/**
 * 工具分类显示名称
 */
export const TOOL_CATEGORY_LABELS: Record<string, string> = {
  [ToolCategory.AI_TOOLS]: 'AI 工具',
  [ToolCategory.CONTENT_TOOLS]: '内容工具',
  [ToolCategory.UTILITIES]: '实用工具',
  [ToolCategory.CUSTOM]: '自定义工具',
};
