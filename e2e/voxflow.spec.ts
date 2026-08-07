import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const fixture = (name: string) => `${process.cwd()}/.e2e/fixtures/${name}`;

async function uploadAndTranscribe(page: Page, filename: string) {
  await page.goto('/');
  await page.getByTestId('media-file-input').setInputFiles(fixture(filename));
  await expect(page.getByTestId('start-transcription')).toBeEnabled();
  await page.getByTestId('start-transcription').click();
  await expect(page.getByTestId('project-revision')).toContainText('Revision 1', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('segment-0')).toContainText('欢迎使用');
}

async function revision(page: Page): Promise<number> {
  const text = await page.getByTestId('project-revision').innerText();
  const match = text.match(/Revision (\d+)/);
  if (!match) throw new Error(`Missing revision in: ${text}`);
  return Number(match[1]);
}

async function waitForNextRevision(page: Page, previous: number) {
  await expect
    .poll(() => revision(page), { timeout: 15_000 })
    .toBeGreaterThan(previous);
  await expect(page.getByTestId('project-revision')).toContainText('已同步');
}

async function downloadExport(
  page: Page,
  testInfo: TestInfo,
  format: 'mp4' | 'mp3' | 'wav' | 'srt' | 'vtt'
) {
  await page.getByTestId('export-menu').click();
  const pending = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByTestId(`export-${format}`).click();
  const download = await pending;
  const output = testInfo.outputPath(`export.${format}`);
  await download.saveAs(output);
  expect(basename(download.suggestedFilename())).toMatch(new RegExp(`\\.${format}$`));
  return output;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('video editing persists and all real export formats download', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'full flow runs on desktop');
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      browserErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));

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
    const duration = Number(
      execFileSync('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', outputs[format],
      ], { encoding: 'utf8' }).trim()
    );
    expect(duration).toBeGreaterThan(0.5);
  }
  expect(readFileSync(outputs.srt, 'utf8')).toContain('VoxFlow');
  expect(readFileSync(outputs.vtt, 'utf8')).toContain('WEBVTT');
  expect(browserErrors).toEqual([]);
});

test('audio upload and compact layout work without browser errors', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'compact flow runs on mobile');
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await uploadAndTranscribe(page, 'deterministic.wav');
  await expect(page.locator('audio[data-testid="media-player"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
