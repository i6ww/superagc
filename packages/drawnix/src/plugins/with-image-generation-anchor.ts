import {
  getSelectedElements,
  PlaitBoard,
  PlaitElement,
  PlaitHistoryBoard,
  PlaitPlugin,
  PlaitPluginElementContext,
  Point,
  RectangleClient,
  Selection,
  Transforms,
} from '@plait/core';
import { ImageGenerationAnchorComponent } from '../components/image-generation-anchor/image-generation-anchor.component';
import {
  isImageGenerationAnchorElement,
  type ImageGenerationAnchorCreateOptions,
  type PlaitImageGenerationAnchor,
} from '../types/image-generation-anchor.types';
import {
  inferImageGenerationAnchorType,
  resolveImageGenerationAnchorSize,
} from '../utils/image-generation-anchor-submission';

function generateImageGenerationAnchorId(): string {
  return `gen-anchor-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function isRectIntersect(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

export const ImageGenerationAnchorTransforms = {
  insertAnchor(
    board: PlaitBoard,
    options: ImageGenerationAnchorCreateOptions
  ): PlaitImageGenerationAnchor {
    const anchorType = options.anchorType ?? inferImageGenerationAnchorType(options);
    const size = resolveImageGenerationAnchorSize({
      size: options.size,
      anchorType,
      targetFrameDimensions: options.targetFrameDimensions,
      requestedSize: options.requestedSize,
      requestedCount: options.requestedCount,
    });

    const anchor: PlaitImageGenerationAnchor = {
      id: generateImageGenerationAnchorId(),
      type: 'generation-anchor',
      points: [
        options.position,
        [options.position[0] + size.width, options.position[1] + size.height],
      ],
      angle: 0,
      anchorType,
      phase: options.phase ?? 'submitted',
      title: options.title ?? '图片生成',
      subtitle: options.subtitle ?? '已提交，等待执行',
      progress: options.progress ?? null,
      error: options.error,
      transitionMode: options.transitionMode ?? 'hold',
      createdAt: Date.now(),
      workflowId: options.workflowId,
      taskIds: options.taskIds ? [...options.taskIds] : [],
      primaryTaskId: options.primaryTaskId,
      batchId: options.batchId,
      batchIndex: options.batchIndex,
      batchTotal: options.batchTotal,
      expectedInsertPosition: options.expectedInsertPosition ?? options.position,
      targetFrameId: options.targetFrameId,
      targetFrameDimensions: options.targetFrameDimensions,
      frameAffinityId: options.frameAffinityId,
      frameAffinityDimensions: options.frameAffinityDimensions,
      requestedSize: options.requestedSize,
      requestedCount: options.requestedCount ?? 1,
      zoom: options.zoom,
      children: [],
    };

    PlaitHistoryBoard.withoutSaving(board, () => {
      Transforms.insertNode(board, anchor, [board.children.length]);
    });

    return anchor;
  },

  updateAnchor(
    board: PlaitBoard,
    elementId: string,
    patch: Partial<PlaitImageGenerationAnchor>
  ): void {
    const index = board.children.findIndex((element: any) => element.id === elementId);
    if (index < 0) {
      return;
    }

    PlaitHistoryBoard.withoutSaving(board, () => {
      Transforms.setNode(board, patch, [index]);
    });
  },

  updatePhase(
    board: PlaitBoard,
    elementId: string,
    phase: PlaitImageGenerationAnchor['phase'],
    extraPatch?: Partial<PlaitImageGenerationAnchor>
  ): void {
    this.updateAnchor(board, elementId, {
      ...extraPatch,
      phase,
    });
  },

  updateGeometry(
    board: PlaitBoard,
    elementId: string,
    options: {
      position?: Point;
      size?: { width: number; height: number };
      zoom?: number;
    }
  ): void {
    const current = this.getAnchorById(board, elementId);
    if (!current) {
      return;
    }

    const position = options.position ?? current.points[0];
    const currentRect = RectangleClient.getRectangleByPoints(current.points);
    const width = options.size?.width ?? currentRect.width;
    const height = options.size?.height ?? currentRect.height;

    this.updateAnchor(board, elementId, {
      points: [position, [position[0] + width, position[1] + height]],
      zoom: options.zoom ?? current.zoom,
    });
  },

  removeAnchor(board: PlaitBoard, elementId: string): void {
    const index = board.children.findIndex((element: any) => element.id === elementId);
    if (index < 0) {
      return;
    }

    PlaitHistoryBoard.withoutSaving(board, () => {
      Transforms.removeNode(board, [index]);
    });
  },

  getAnchorById(
    board: PlaitBoard,
    elementId: string
  ): PlaitImageGenerationAnchor | null {
    const element = board.children.find((item: any) => item.id === elementId);
    return element && isImageGenerationAnchorElement(element) ? element : null;
  },

  getAnchorByWorkflowId(
    board: PlaitBoard,
    workflowId: string
  ): PlaitImageGenerationAnchor | null {
    const element = board.children.find(
      (item) => isImageGenerationAnchorElement(item) && item.workflowId === workflowId
    );
    return element && isImageGenerationAnchorElement(element) ? element : null;
  },

  getAnchorsByWorkflowId(
    board: PlaitBoard,
    workflowId: string
  ): PlaitImageGenerationAnchor[] {
    return board.children.filter(
      (item) =>
        isImageGenerationAnchorElement(item) && item.workflowId === workflowId
    ) as PlaitImageGenerationAnchor[];
  },

  getAnchorByTaskId(
    board: PlaitBoard,
    taskId: string
  ): PlaitImageGenerationAnchor | null {
    const element = board.children.find(
      (item) => isImageGenerationAnchorElement(item) && item.taskIds.includes(taskId)
    );
    return element && isImageGenerationAnchorElement(element) ? element : null;
  },

  getAnchorByBatchSlot(
    board: PlaitBoard,
    options: {
      workflowId?: string;
      batchId?: string;
      batchIndex?: number;
    }
  ): PlaitImageGenerationAnchor | null {
    const { workflowId, batchId, batchIndex } = options;
    if (!workflowId || !batchId || typeof batchIndex !== 'number') {
      return null;
    }

    const element = board.children.find(
      (item) =>
        isImageGenerationAnchorElement(item) &&
        item.workflowId === workflowId &&
        item.batchId === batchId &&
        item.batchIndex === batchIndex
    );

    return element && isImageGenerationAnchorElement(element) ? element : null;
  },

  getAllAnchors(board: PlaitBoard): PlaitImageGenerationAnchor[] {
    return board.children.filter(isImageGenerationAnchorElement) as PlaitImageGenerationAnchor[];
  },
};

export const withImageGenerationAnchor: PlaitPlugin = (board: PlaitBoard) => {
  const {
    drawElement,
    getRectangle,
    isHit,
    isRectangleHit,
    isMovable,
    isAlign,
    getDeletedFragment: originGetDeletedFragment,
  } =
    board;

  board.drawElement = (context: PlaitPluginElementContext) => {
    if (isImageGenerationAnchorElement(context.element)) {
      return ImageGenerationAnchorComponent;
    }

    return drawElement(context);
  };

  board.getRectangle = (element: PlaitElement) => {
    if (isImageGenerationAnchorElement(element)) {
      return RectangleClient.getRectangleByPoints(element.points);
    }

    return getRectangle(element);
  };

  board.isHit = (element: PlaitElement, point: Point, isStrict?: boolean) => {
    if (isImageGenerationAnchorElement(element)) {
      const rect = RectangleClient.getRectangleByPoints(element.points);
      return (
        point[0] >= rect.x &&
        point[0] <= rect.x + rect.width &&
        point[1] >= rect.y &&
        point[1] <= rect.y + rect.height
      );
    }

    return isHit(element, point, isStrict);
  };

  board.isRectangleHit = (element: PlaitElement, selection: Selection) => {
    if (isImageGenerationAnchorElement(element)) {
      const rect = RectangleClient.getRectangleByPoints(element.points);
      const selectionRect = RectangleClient.getRectangleByPoints([
        selection.anchor,
        selection.focus,
      ]);

      return isRectIntersect(rect, selectionRect);
    }

    return isRectangleHit(element, selection);
  };

  board.isMovable = (element: PlaitElement) => {
    if (isImageGenerationAnchorElement(element)) {
      return true;
    }

    return isMovable(element);
  };

  board.isAlign = (element: PlaitElement) => {
    if (isImageGenerationAnchorElement(element)) {
      return true;
    }

    return isAlign(element);
  };

  board.getDeletedFragment = (data: PlaitElement[]) => {
    const selectedAnchors = getSelectedElements(board).filter(
      isImageGenerationAnchorElement
    );

    if (selectedAnchors.length > 0) {
      data.push(...selectedAnchors);
    }

    return originGetDeletedFragment(data);
  };

  return board;
};

export default withImageGenerationAnchor;
