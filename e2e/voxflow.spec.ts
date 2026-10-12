import { expect, test } from '@playwright/test';
import {
  collectBrowserErrors,
  downloadExport,
  expectValidMediaOutput,
  expectValidSubtitleOutput,
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

test('video editing persists and all real export formats download', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'full flow runs on desktop');
  const browserErrors = collectBrowserErrors(page);

  await uploadAndTranscribe(page, 'deterministic.mp4');
  await expect(page.locator('video[data-testid="media-player"]')).toBeVisible();
  await expect(page.getByTestId('segment-3')).toContainText('最后导出');

  await page.getByTestId('transcript-search').fill('稳定标识');
  await page.getByTestId('transcript-search').press('Enter');
  await expect(page.getByTestId('search-count')).toHaveText('找到 1 条结果');

  await page.getByTestId('segment-1').click();
  await expect
    .poll(() => page.getByTestId('media-player').evaluate((media: HTMLMediaElement) => media.currentTime))
    .toBeGreaterThan(1);

  await page.getByRole('button', { name: '逐字编辑' }).click();
  let current = await revision(page);
  await page.getByTestId('token-0').click({ button: 'right' });
  await page.getByRole('button', { name: '删除此句' }).click();
  await waitForNextRevision(page, current);

  await page.getByRole('button', { name: '段落编辑' }).click();
  current = await revision(page);
  await page.getByTestId('segment-2').click({ button: 'right' });
  await page.getByRole('button', { name: '删除此句' }).click();
  await waitForNextRevision(page, current);
  await expect(page.locator('[data-testid^="segment-"]')).toHaveCount(3);

  current = await revision(page);
  await page.getByTestId('undo-edit').click();
  await waitForNextRevision(page, current);
  await expect(page.locator('[data-testid^="segment-"]')).toHaveCount(4);
  current = await revision(page);
  await page.getByTestId('redo-edit').click();
  await waitForNextRevision(page, current);

  current = await revision(page);
  await page.getByTestId('segment-0').dragTo(page.getByTestId('segment-1'));
  await waitForNextRevision(page, current);

  current = await revision(page);
  await page.getByTestId('speaker-0').click({ button: 'right' });
  await page.getByRole('button', { name: /编辑名称/ }).click();
  const renameDialog = page.getByRole('dialog', { name: '编辑说话人名称' });
  await renameDialog.getByRole('textbox').fill('主持人');
  await renameDialog.getByRole('button', { name: '保存名称' }).click();
  await waitForNextRevision(page, current);
  await expect(page.getByTestId('speaker-0')).toHaveText('主持人');

  current = await revision(page);
  await page.getByTestId('speaker-1').click({ button: 'right' });
  await page.getByRole('button', { name: '主持人' }).click();
  await page.getByRole('dialog', { name: '合并说话人' }).getByRole('button', { name: '确认合并' }).click();
  await waitForNextRevision(page, current);
  await expect(page.getByTestId('speaker-1')).toHaveCount(0);

  const persistedRevision = await revision(page);
  await page.reload();
  await expect(page.getByTestId('project-revision')).toContainText(`Revision ${persistedRevision}`);
  await expect(page.getByTestId('speaker-0')).toHaveText('主持人');
  await expect(page.locator('[data-testid^="segment-"]')).toHaveCount(3);

  const outputs: Record<string, string> = {};
  for (const format of ['mp4', 'mp3', 'wav', 'srt', 'vtt'] as const) {
    outputs[format] = await downloadExport(page, testInfo, format);
  }
  for (const format of ['mp4', 'mp3', 'wav'] as const) {
    expectValidMediaOutput(outputs[format]);
  }
  expectValidSubtitleOutput(outputs.srt, 'srt');
  expectValidSubtitleOutput(outputs.vtt, 'vtt');
  expect(browserErrors).toEqual([]);
});

test('audio upload and compact layout work without browser errors', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'compact flow runs on mobile');
  const browserErrors = collectBrowserErrors(page);
  await uploadAndTranscribe(page, 'deterministic.wav');
  await expect(page.locator('audio[data-testid="media-player"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
