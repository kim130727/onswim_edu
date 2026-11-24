import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

// Runs against the local deployed applications. Only isolated preview grading
// receives a POST; neither student attempts nor authored content is changed.
const editor = process.env.MODU_PARITY_EDITOR_URL ?? 'http://localhost:8000';
const source = process.env.MODU_PARITY_PROBLEM ?? 'ko/TS_01.초등학교 3학년_01.객관식/2학기_01단원_곱셈/S3_elem_3_008540.dsl.py';
const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  // Verify /student/ serves the React student shell cleanly
  const studentRes = await fetch(`${editor}/student/`);
  assert.equal(studentRes.status, 200, '/student/ serves React student app');
  const studentHtml = await studentRes.text();
  assert.ok(studentHtml.includes('<base href="/static/editor_next/student_app/"'), '/student/ injects static base href');

  await page.goto(`${editor}/editor-konva/?problem=${encodeURIComponent(source)}`);
  await page.getByTitle(source, { exact: true }).waitFor();
  await page.getByRole('button', { name: '앱처럼 풀어보기', exact: true }).click();
  const preview = page.locator('.react-student-preview');
  await preview.waitFor();
  const choice = preview.getByRole('button', { name: '(3) 60 × 4', exact: true });
  await choice.waitFor();
  const output = resolve('../../../.tmp/student-parity');
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: resolve(output, 'multiplication-preview.png'), fullPage: true });
  await choice.click();
  await preview.getByTestId('preview-submit-btn').click();
  await preview.getByText('맞았어요!', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(`React student parity, multiplication preview, and choice grading passed. Screenshot: ${output}`);
} finally {
  await browser.close();
}
