import { describe, expect, it } from 'vitest';
import { buildFramePrompt, buildVideoPrompt } from './prompt-builders';

describe('prompt-builders', () => {
  it('builds video prompt with style, bgm and character anchor', () => {
    const prompt = buildVideoPrompt(
      {
        id: 'shot_1',
        startTime: 0,
        endTime: 3,
        description: '城市夜景。',
        narration: '旁白内容。',
        dialogue: '你好。',
        dialogue_speakers: '主角',
        speech_relation: 'both',
        first_frame_prompt: '首帧描述。',
        last_frame_prompt: '尾帧描述。',
        camera_movement: '缓慢推近。',
        transition_hint: '硬切。',
        character_description: 'young woman with short hair.',
        type: 'opening',
        label: '开场',
      },
      {
        totalDuration: 10,
        aspect_ratio: '16x9',
        shots: [],
        video_style: '赛博朋克',
        bgm_mood: '紧张',
      }
    );

    expect(prompt).toContain('画面风格：赛博朋克');
    expect(prompt).toContain('BGM情绪：紧张');
    expect(prompt).toContain('角色一致性：The same young woman with short hair');
    expect(prompt).toContain('镜头主题：城市夜景');
  });

  it('prefixes frame prompt with product video style', () => {
    expect(
      buildFramePrompt('角色站在雨夜街头', undefined, {
        videoStyle: '电影感光影',
      })
    ).toBe('电影感光影。角色站在雨夜街头');
  });
});
