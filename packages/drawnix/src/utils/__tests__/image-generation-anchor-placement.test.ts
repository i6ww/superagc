import { describe, expect, it } from 'vitest';
import type { PlaitBoard } from '@plait/core';
import {
  resolveImageGenerationAnchorAvailablePosition,
  resolveImageGenerationBatchAnchorPositions,
} from '../image-generation-anchor-placement';

function createBoard(children: unknown[]): PlaitBoard {
  return {
    children,
  } as unknown as PlaitBoard;
}

describe('image-generation-anchor-placement', () => {
  it('keeps the desired position when the area is free', () => {
    const board = createBoard([]);

    const position = resolveImageGenerationAnchorAvailablePosition(
      board,
      [100, 120],
      { width: 320, height: 180 }
    );

    expect(position).toEqual([100, 120]);
  });

  it('moves the anchor to a nearby lane when the desired area is occupied', () => {
    const board = createBoard([
      {
        id: 'image-1',
        type: 'image',
        points: [
          [100, 120],
          [420, 300],
        ],
      },
    ]);

    const position = resolveImageGenerationAnchorAvailablePosition(
      board,
      [100, 120],
      { width: 320, height: 180 }
    );

    expect(position).toEqual([460, 120]);
  });

  it('ignores workzones when checking collisions', () => {
    const board = createBoard([
      {
        id: 'workzone-1',
        type: 'workzone',
        points: [
          [100, 120],
          [460, 360],
        ],
      },
    ]);

    const position = resolveImageGenerationAnchorAvailablePosition(
      board,
      [100, 120],
      { width: 320, height: 180 }
    );

    expect(position).toEqual([100, 120]);
  });

  it('fans frame-adjacent batches to the right when the nearby lane is free', () => {
    const board = createBoard([]);
    const positions = resolveImageGenerationBatchAnchorPositions(
      board,
      [100, 100],
      { width: 320, height: 180 },
      3,
      {
        frameRect: { x: 100, y: 100, width: 400, height: 240 },
      }
    );

    expect(positions).toHaveLength(3);
    expect(positions.every((position) => position[0] > 500)).toBe(true);
    expect(new Set(positions.map((position) => position.join(','))).size).toBe(3);
  });

  it('switches frame-adjacent batches to bottom when the right side is occupied', () => {
    const board = createBoard([
      {
        id: 'image-right-lane',
        type: 'image',
        points: [
          [520, -40],
          [980, 320],
        ],
      },
    ]);
    const positions = resolveImageGenerationBatchAnchorPositions(
      board,
      [100, 100],
      { width: 320, height: 180 },
      2,
      {
        frameRect: { x: 100, y: 100, width: 400, height: 240 },
      }
    );

    expect(positions).toHaveLength(2);
    expect(positions.every((position) => position[1] > 340)).toBe(true);
  });
});
