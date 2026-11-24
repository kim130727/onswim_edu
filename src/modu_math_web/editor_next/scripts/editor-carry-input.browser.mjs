import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

// Uses isolated preview grading, never writes problem files or student attempts.
const base = process.env.MODU_PARITY_EDITOR_URL ?? 'http://localhost:8000';
const source = 'ko/TS_01.초등학교 3학년_01.객관식/1학기_01단원_덧셈과 뺄셈/P3_1_01_00040_02135.dsl.py';
const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/editor-konva/?problem=${encodeURIComponent(source)}`);
  await page.getByTitle(source, { exact: true }).waitFor();
  await page.getByRole('button', { name: '앱처럼 풀어보기', exact: true }).click();
  const preview = page.locator('.react-student-preview');
  const fields = preview.getByRole('textbox');
  await fields.first().waitFor();
  assert.equal(await fields.count(), 5);
  const values = () => fields.evaluateAll(elements => elements.map(element => element.value));
  await fields.first().click();
  await page.keyboard.type('11921');
  assert.deepEqual(await values(), ['1', '1', '9', '2', '1'], 'Typing advances through carry and result cells in declared order');
  const grade = async expected => {
    const response = page.waitForResponse(response => response.url().endsWith('/student-preview/') && response.request().method() === 'POST');
    await preview.getByTestId('preview-submit-btn').click();
    const result = await response;
    assert.deepEqual(result.request().postDataJSON().answer, expected, 'Each digit keeps its schema field');
    return (await result.json()).correct;
  };
  await fields.nth(2).click();
  await page.keyboard.type('8');
  assert.deepEqual(await values(), ['1', '1', '8', '2', '1'], 'Clicking an existing digit allows replacement');
  assert.equal(await grade(['1', '1', '8', '2', '1']), false);
  await preview.getByText('다시 생각해 볼까요?', { exact: true }).waitFor();
  await fields.nth(2).click();
  await page.keyboard.type('9');
  assert.equal(await grade(['1', '1', '9', '2', '1']), true);
  await preview.getByText('맞았어요!', { exact: true }).waitFor();
  const submit = preview.getByTestId('preview-submit-btn');
  assert.equal(await submit.isDisabled(), true);
  const output = resolve('../../../.tmp/carry-input');
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: resolve(output, 'carry-digits-correct.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`Carry digits, automatic focus, replacement, schema ordering, and wrong/correct grading passed. Screenshot: ${output}`);
} catch (error) {
  if (page) {
    const output = resolve('../../../.tmp/carry-input');
    mkdirSync(output, { recursive: true });
    await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
  }
  throw error;
} finally {
  await browser.close();
}
