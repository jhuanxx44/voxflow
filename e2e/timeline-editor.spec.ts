import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import {
  collectBrowserErrors,
  downloadExport,
  revision,
  uploadAndTranscribe,
  waitForNextRevision,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const storageResetKey = 'voxflow:e2e:storage-reset';
    if (sessionStorage.getItem(storageResetKey) === null) {
      localStorage.clear();
      sessionStorage.setItem(storageResetKey, '1');
    }
  });
});

async function clipIds(page: Page): Promise<string[]> {
  return page.locator('[data-testid="timeline-clip"]').evaluateAll((clips) =>
    clips.map((clip) => clip.getAttribute('data-clip-id') || '')
  );
}

async function dragPointer(
  page: Page,
  source: { x: number; y: number },
  target: { x: number; y: number },
  beforeRelease?: () => Promise<void>
) {
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await beforeRelease?.();
  await page.mouse.up();
}

test('split uses one plan, playback is canonical, and history persists', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'mutation flow runs on desktop');
  const browserErrors = collectBrowserErrors(page);
  await uploadAndTranscribe(page, 'deterministic.mp4');

  const editor = page.getByTestId('timeline-editor');
  await expect(editor).toBeVisible();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(4);
  await expect(page.getByTestId('timeline-time')).toContainText('/ 00:04');

  const editBodies: Array<Record<string, unknown>> = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !/\/edits(?:\/preview)?$/.test(request.url())) return;
    editBodies.push(request.postDataJSON() as Record<string, unknown>);
  });

  const baseRevision = await revision(page);
  await page.getByTestId('timeline-ruler').click({ position: { x: 420, y: 14 } });
  await expect(page.getByTestId('timeline-split')).toBeEnabled();
  await page.getByTestId('timeline-split').click();
  await waitForNextRevision(page, baseRevision);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(5);
  expect(editBodies).toHaveLength(2);
  expect(editBodies[0]).toEqual(editBodies[1]);
  expect(editBodies[0].client_request_id).toMatch(/^web-/);

  const splitIds = await clipIds(page);
  await page.reload();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(5);
  expect(await clipIds(page)).toEqual(splitIds);

  await page.getByTestId('timeline-ruler').click({ position: { x: 180, y: 14 } });
  const playheadBefore = Number(await editor.getAttribute('data-playhead-ms'));
  await page.getByTestId('timeline-play-toggle').click();
  await expect
    .poll(async () => Number(await editor.getAttribute('data-playhead-ms')))
    .toBeGreaterThan(playheadBefore + 100);
  await page.getByTestId('media-player').evaluate((media: HTMLMediaElement) => media.pause());
  await expect(page.getByTestId('timeline-play-toggle')).toContainText('播放');
  const pausedAt = Number(await editor.getAttribute('data-playhead-ms'));
  await page.waitForTimeout(150);
  expect(Number(await editor.getAttribute('data-playhead-ms'))).toBe(pausedAt);

  const clips = page.getByTestId('timeline-clip');
  await clips.nth(1).click();
  let current = await revision(page);
  await page.getByTestId('timeline-delete').click();
  await waitForNextRevision(page, current);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(4);

  current = await revision(page);
  await page.keyboard.press('Control+z');
  await waitForNextRevision(page, current);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(5);
  current = await revision(page);
  await page.keyboard.press('Control+Shift+z');
  await waitForNextRevision(page, current);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(4);

  const persistedIds = await clipIds(page);
  const persistedRevision = await revision(page);
  await page.reload();
  await expect(page.getByTestId('project-revision')).toContainText(`Revision ${persistedRevision}`);
  expect(await clipIds(page)).toEqual(persistedIds);
  const expectedDurationSeconds = await page.getByTestId('timeline-clip').evaluateAll((items) =>
    items.reduce((total, item) => total + Number(item.getAttribute('data-duration-ms') || 0), 0) / 1_000
  );
  const exported = await downloadExport(page, testInfo, 'mp4');
  const exportedDurationSeconds = Number(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', exported],
      { encoding: 'utf8' }
    ).trim()
  );
  expect(Math.abs(exportedDurationSeconds - expectedDurationSeconds)).toBeLessThan(0.2);
  expect(browserErrors).toEqual([]);
});

test('pointer trim restores source bounds and reorder commits only on release', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'pointer flow runs on desktop');
  const browserErrors = collectBrowserErrors(page);
  await uploadAndTranscribe(page, 'deterministic.mp4');

  const editBodies: Array<Record<string, unknown>> = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/edits(?:\/preview)?$/.test(request.url())) {
      editBodies.push(request.postDataJSON() as Record<string, unknown>);
    }
  });

  let firstClip = page.getByTestId('timeline-clip').nth(0);
  const trimIn = firstClip.getByTestId('timeline-trim-in');
  await trimIn.scrollIntoViewIfNeeded();
  const trimBox = await trimIn.boundingBox();
  if (!trimBox) throw new Error('trim handle has no box');
  let current = await revision(page);
  await dragPointer(
    page,
    { x: trimBox.x + trimBox.width / 2, y: trimBox.y + trimBox.height / 2 },
    { x: trimBox.x + 45, y: trimBox.y + trimBox.height / 2 },
    async () => {
      await expect(page.getByTestId('timeline-editor')).toHaveAttribute('data-gesture-kind', 'trim');
      expect(Number(await firstClip.getAttribute('data-source-in-ms'))).toBeGreaterThan(0);
    }
  );
  await waitForNextRevision(page, current);
  firstClip = page.getByTestId('timeline-clip').nth(0);
  expect(Number(await firstClip.getAttribute('data-source-in-ms'))).toBeGreaterThan(0);
  expect(editBodies.slice(-2)[0]).toEqual(editBodies.slice(-2)[1]);

  const restoreHandle = firstClip.getByTestId('timeline-trim-in');
  await restoreHandle.scrollIntoViewIfNeeded();
  const restoreBox = await restoreHandle.boundingBox();
  if (!restoreBox) throw new Error('restore handle has no box');
  current = await revision(page);
  await dragPointer(
    page,
    { x: restoreBox.x + restoreBox.width / 2, y: restoreBox.y + restoreBox.height / 2 },
    { x: restoreBox.x - 80, y: restoreBox.y + restoreBox.height / 2 }
  );
  await waitForNextRevision(page, current);
  firstClip = page.getByTestId('timeline-clip').nth(0);
  expect(await firstClip.getAttribute('data-source-in-ms')).toBe('0');

  const noOpRequestCount = editBodies.length;
  const noOpRevision = await revision(page);
  const firstBox = await firstClip.boundingBox();
  if (!firstBox) throw new Error('clip has no box');
  await dragPointer(
    page,
    { x: firstBox.x + firstBox.width / 2, y: firstBox.y + firstBox.height / 2 },
    { x: firstBox.x + firstBox.width / 2 + 2, y: firstBox.y + firstBox.height / 2 }
  );
  await page.waitForTimeout(150);
  expect(editBodies).toHaveLength(noOpRequestCount);
  expect(await revision(page)).toBe(noOpRevision);

  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstBox.x + firstBox.width + 40, firstBox.y + firstBox.height / 2, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(editBodies).toHaveLength(noOpRequestCount);

  const beforeOrder = await clipIds(page);
  const targetClip = page.getByTestId('timeline-clip').nth(3);
  const sourceBox = await firstClip.boundingBox();
  const targetBox = await targetClip.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('reorder clip has no box');
  current = await revision(page);
  const beforeReleaseCount = editBodies.length;
  await dragPointer(
    page,
    { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 },
    { x: targetBox.x + targetBox.width * 0.8, y: targetBox.y + targetBox.height / 2 },
    async () => expect(editBodies).toHaveLength(beforeReleaseCount)
  );
  await waitForNextRevision(page, current);
  const afterOrder = await clipIds(page);
  expect(afterOrder).not.toEqual(beforeOrder);
  expect(afterOrder.at(-1)).toBe(beforeOrder[0]);

  current = await revision(page);
  await page.getByTestId('timeline-clip').last().focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await waitForNextRevision(page, current);
  expect(await clipIds(page)).not.toEqual(afterOrder);
  expect(browserErrors).toEqual([]);
});

test('network failure rolls back and stale revision reloads canonical state', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'failure flow runs on desktop');
  const browserErrors = collectBrowserErrors(page);
  await uploadAndTranscribe(page, 'deterministic.mp4');

  const initialRevision = await revision(page);
  let applyRequests = 0;
  page.on('request', (webRequest) => {
    if (webRequest.method() === 'POST' && /\/edits$/.test(webRequest.url())) applyRequests += 1;
  });
  await page.route('**/api/v1/projects/*/edits/preview', (route) => route.abort('failed'));
  await page.getByTestId('timeline-ruler').click({ position: { x: 360, y: 14 } });
  await page.getByTestId('timeline-split').click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await revision(page)).toBe(initialRevision);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(4);
  expect(applyRequests).toBe(0);
  await page.unroute('**/api/v1/projects/*/edits/preview');

  await page.route('**/api/v1/projects/*/edits', (route) => route.abort('failed'));
  await page.getByTestId('timeline-clip').nth(0).click();
  await page.getByTestId('timeline-delete').click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await revision(page)).toBe(initialRevision);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(4);
  await page.unroute('**/api/v1/projects/*/edits');

  const projectId = await page.evaluate(() => localStorage.getItem('voxflow.currentProjectId'));
  if (!projectId) throw new Error('project id missing from editor pointer');
  const timelineResponse = await request.get(`/api/v1/projects/${projectId}/timeline?offset=0&limit=200`);
  const timelinePayload = await timelineResponse.json();
  const ids = timelinePayload.data.items.map((clip: { id: string }) => clip.id) as string[];
  const externalPlan = {
    schema_version: 1,
    project_id: projectId,
    expected_revision: initialRevision,
    client_request_id: `e2e-external-${Date.now()}`,
    reason: 'E2E external timeline mutation',
    operations: [{ op: 'move_clip', clip_id: ids.at(-1), anchor_clip_id: ids[0], position: 'before' }],
  };
  const externalApply = await request.post(`/api/v1/projects/${projectId}/edits`, { data: externalPlan });
  expect(externalApply.ok()).toBeTruthy();

  await page.getByTestId('timeline-clip').nth(0).click();
  await page.getByTestId('timeline-delete').click();
  await expect(page.getByRole('alert')).toContainText('其他客户端');
  await expect(page.getByTestId('project-revision')).toContainText(`Revision ${initialRevision + 1}`);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(4);
  await expect(page.getByTestId('timeline-editor').getByRole('button', { name: '撤销' })).toBeDisabled();
  expect(await clipIds(page)).toEqual([ids.at(-1), ...ids.slice(0, -1)]);
  expect(browserErrors).toEqual(
    expect.arrayContaining([
      expect.stringContaining('net::ERR_FAILED'),
      expect.stringContaining('409 (CONFLICT)'),
    ])
  );
  expect(browserErrors.every((error) => /ERR_FAILED|409 \(CONFLICT\)/.test(error))).toBeTruthy();
});

test('replacement clips disable trim and split while remaining reorderable', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'replacement flow runs on desktop');
  const browserErrors = collectBrowserErrors(page);
  await uploadAndTranscribe(page, 'deterministic.mp4');
  const projectId = await page.evaluate(() => localStorage.getItem('voxflow.currentProjectId'));
  if (!projectId) throw new Error('project id missing');
  const currentRevision = await revision(page);
  const timelineResponse = await request.get(`/api/v1/projects/${projectId}/timeline?offset=0&limit=200`);
  const timelinePayload = await timelineResponse.json();
  const clipId = timelinePayload.data.items[1].id as string;

  const candidateResponse = await request.post(`/api/v1/projects/${projectId}/speech-replacements`, {
    data: {
      expected_revision: currentRevision,
      clip_id: clipId,
      text: '稳定标识让编辑可靠。',
      duration_policy: 'pad_or_trim',
    },
  });
  expect(candidateResponse.ok()).toBeTruthy();
  const candidatePayload = await candidateResponse.json();
  const operation = candidatePayload.data.result.recommended_operation;
  const plan = {
    schema_version: 1,
    project_id: projectId,
    expected_revision: currentRevision,
    client_request_id: `e2e-replacement-${Date.now()}`,
    reason: 'E2E replacement',
    operations: [operation],
  };
  const applyResponse = await request.post(`/api/v1/projects/${projectId}/edits`, { data: plan });
  expect(applyResponse.ok()).toBeTruthy();
  await page.reload();

  const replacement = page.locator(`[data-clip-id="${clipId}"]`);
  await expect(replacement).toHaveAttribute('data-clip-kind', 'replacement');
  await expect(replacement.getByTestId('timeline-trim-in')).toHaveCount(0);
  await replacement.click();
  const replacementBox = await replacement.boundingBox();
  const rulerBox = await page.getByTestId('timeline-ruler').boundingBox();
  if (!replacementBox || !rulerBox) throw new Error('replacement geometry missing');
  await page.getByTestId('timeline-ruler').click({
    position: {
      x: replacementBox.x + replacementBox.width / 2 - rulerBox.x,
      y: 14,
    },
  });
  await expect(page.getByTestId('timeline-split')).toBeDisabled();
  await expect(page.getByTestId('timeline-delete')).toBeEnabled();
  await page.getByTestId('timeline-play-toggle').click();
  await expect(page.getByTestId('timeline-editor')).toHaveAttribute('data-active-clip-id', clipId);
  const replacementIndex = timelinePayload.data.items.findIndex((clip: { id: string }) => clip.id === clipId);
  const nextClipId = timelinePayload.data.items[replacementIndex + 1].id as string;
  await expect
    .poll(() => page.getByTestId('timeline-editor').getAttribute('data-active-clip-id'), {
      timeout: 5_000,
    })
    .toBe(nextClipId);
  await page.getByTestId('timeline-play-toggle').click();
  const beforeOrder = await clipIds(page);
  const beforeRevision = await revision(page);
  await replacement.focus();
  await page.keyboard.press('Alt+ArrowRight');
  await waitForNextRevision(page, beforeRevision);
  expect(await clipIds(page)).not.toEqual(beforeOrder);
  expect(browserErrors).toEqual([]);
});

test('mobile timeline stays inside the page and scrolls internally', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'responsive flow runs on mobile');
  const browserErrors = collectBrowserErrors(page);
  await uploadAndTranscribe(page, 'deterministic.wav');
  await expect(page.getByTestId('timeline-editor')).toBeVisible();
  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(pageOverflow).toBeLessThanOrEqual(1);
  const scrollMetrics = await page.getByTestId('timeline-scroll').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(scrollMetrics.clientWidth).toBeGreaterThan(0);
  expect(scrollMetrics.scrollWidth).toBeGreaterThanOrEqual(scrollMetrics.clientWidth);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test('split children can regrow but never trim into each other', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'pointer flow runs on desktop');
  const browserErrors = collectBrowserErrors(page);
  await uploadAndTranscribe(page, 'deterministic.mp4');

  await page.getByTestId('timeline-ruler').click({ position: { x: 420, y: 14 } });
  const idsBeforeSplit = new Set(await clipIds(page));
  let current = await revision(page);
  await page.getByTestId('timeline-split').click();
  await waitForNextRevision(page, current);

  // The split children are the only clip IDs the split created, in timeline order.
  const [leftId, rightId] = (await clipIds(page)).filter((id) => !idsBeforeSplit.has(id));
  const leftClip = page.locator(`[data-clip-id="${leftId}"]`);
  const rightSourceIn = Number(
    await page.locator(`[data-clip-id="${rightId}"]`).getAttribute('data-source-in-ms')
  );
  expect(Number(await leftClip.getAttribute('data-source-out-ms'))).toBe(rightSourceIn);

  async function dragOutEdge(deltaPx: number) {
    const handle = leftClip.getByTestId('timeline-trim-out');
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    if (!box) throw new Error('trim handle has no box');
    const y = box.y + box.height / 2;
    await dragPointer(page, { x: box.x + box.width / 2, y }, { x: box.x + box.width / 2 + deltaPx, y });
  }

  current = await revision(page);
  await dragOutEdge(-30);
  await waitForNextRevision(page, current);
  expect(Number(await leftClip.getAttribute('data-source-out-ms'))).toBeLessThan(rightSourceIn);

  current = await revision(page);
  await dragOutEdge(400);
  await waitForNextRevision(page, current);
  expect(Number(await leftClip.getAttribute('data-source-out-ms'))).toBe(rightSourceIn);
  await expect(page.getByText('overlap another clip')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
