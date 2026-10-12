import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyEditPlan,
  createEditPlan,
  previewEditPlan,
} from './projectService';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('project edit plan client', () => {
  it('serializes the exact same plan for preview and apply', async () => {
    const bodies: unknown[] = [];
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        urls.push(String(url));
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );

    const plan = createEditPlan(
      'prj_test',
      7,
      [{ op: 'split_clip', clip_id: 'clip_a', at_ms: 1_250 }],
      'Timeline split'
    );
    await previewEditPlan(plan);
    await applyEditPlan(plan);

    expect(plan.client_request_id).toMatch(/^web-/);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual(plan);
    expect(bodies[1]).toEqual(plan);
    expect(urls).toEqual([
      '/api/v1/projects/prj_test/edits/preview',
      '/api/v1/projects/prj_test/edits',
    ]);
  });
});
