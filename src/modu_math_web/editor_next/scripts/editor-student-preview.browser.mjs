import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.MODU_EDITOR_TEST_URL ?? 'http://127.0.0.1:5189/static/editor_next/konva_assets/';
const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
const output = resolve('../../../.tmp/editor-student-preview');
mkdirSync(output, { recursive: true });
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let fail = false;
  let loads = 0;
  const writes = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/student-preview/')) {
      if (request.method() === 'POST') {
        const data = request.postDataJSON();
        assert.equal(data.revision, 'saved-v1');
        return route.fulfill({ json: { correct: data.answer === '5' } });
      }
      loads++;
      if (fail) return route.fulfill({ status: 500, json: { error: 'Preview fixture unavailable' } });
      return route.fulfill({ json: {
        id: 0, problem_id: 'preview', language: 'ko', revision: 'saved-v1',
        prompt: '2 + 3을 계산하세요.', owner_name: '온쉼에듀',
        presentation: { mode: 'panel_input', show_canvas: true },
        input_schema: { fields: [{ id: 'field-1', type: 'number' }], unit: '' },
        semantic_data: { metadata: { question: '2 + 3을 계산하세요.' } }, layout_data: {},
        renderer_data: { view_box: { x: 0, y: 0, width: 600, height: 200 }, elements: [{ id: 'sum', type: 'text', text: '2 + 3 = ?', attributes: { x: 40, y: 70, 'font-size': 32 } }] },
      } });
    }
    if (request.method() !== 'GET') writes.push(request.url());
    return route.fulfill({ json: { problems: [] } });
  });
  await page.goto(base);
  await page.getByRole('button', { name: '글자', exact: true }).click();
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  const draft = await page.locator('.konva-json-panel textarea').inputValue();
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));
  await page.getByRole('button', { name: '앱처럼 풀어보기', exact: true }).click();
  const preview = page.locator('.react-student-preview');
  await preview.waitFor();
  await preview.getByText(/계산하세요/).waitFor();
  assert.equal(await preview.getByText('요소 편집', { exact: true }).count(), 0);
  await page.screenshot({ path: resolve(output, 'loaded.png'), fullPage: true });
  const answer = preview.getByRole('textbox').first();
  await answer.fill('5');
  await preview.getByTestId('preview-submit-btn').click();
  await preview.getByText('맞았어요!', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'solve.png'), fullPage: true });
  await page.getByRole('button', { name: '편집으로 돌아가기', exact: true }).click();
  assert.equal(await page.locator('.konva-json-panel textarea').inputValue(), draft, 'Unsaved editor state survives preview');
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storageBefore, 'Preview does not persist progress');
  fail = true;
  await page.getByRole('button', { name: '앱처럼 풀어보기', exact: true }).click();
  await page.getByRole('alert').waitFor();
  fail = false;
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await preview.getByTestId('react-student-preview-body').waitFor();
  await page.getByRole('button', { name: '편집으로 돌아가기', exact: true }).click();
  assert.equal(loads, 3, 'Every opening/retry reloads the saved problem');
  assert.deepEqual(writes, [], 'Only the isolated preview grading endpoint receives a POST');
  assert.deepEqual(errors, []);
  console.log(`React student preview passed. Screenshot: ${output}`);
} catch (error) {
  if (page) {
    await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
  }
  throw error;
} finally {
  await browser.close();
}
