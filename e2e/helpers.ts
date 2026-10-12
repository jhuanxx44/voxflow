import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';

export const fixture = (name: string) => `${process.cwd()}/.e2e/fixtures/${name}`;

export function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

export async function uploadAndTranscribe(page: Page, filename: string) {
  await page.goto('/');
  await page.getByTestId('media-file-input').setInputFiles(fixture(filename));
  await expect(page.getByTestId('start-transcription')).toBeEnabled();
  await page.getByTestId('start-transcription').click();
  await expect(page.getByTestId('project-revision')).toContainText('Revision 1', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('segment-0')).toContainText('欢迎使用');
}

export async function revision(page: Page): Promise<number> {
  const value = await page.getByTestId('project-revision').innerText();
  const match = value.match(/Revision (\d+)/);
  if (!match) throw new Error(`Missing revision in: ${value}`);
  return Number(match[1]);
}

export async function waitForNextRevision(page: Page, previous: number) {
  await expect
    .poll(() => revision(page), { timeout: 15_000 })
    .toBe(previous + 1);
  await expect(page.getByTestId('project-revision')).toContainText('已同步');
}

export async function downloadExport(
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

export function expectValidMediaOutput(path: string) {
  const duration = Number(
    execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path,
    ], { encoding: 'utf8' }).trim()
  );
  expect(duration).toBeGreaterThan(0.5);
}

export function expectValidSubtitleOutput(path: string, format: 'srt' | 'vtt') {
  expect(readFileSync(path, 'utf8')).toContain(format === 'vtt' ? 'WEBVTT' : 'VoxFlow');
}
