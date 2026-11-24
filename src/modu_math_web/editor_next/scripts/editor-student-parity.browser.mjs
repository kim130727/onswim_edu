import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

// Runs against the local deployed applications. Only isolated preview grading
// receives a POST; neither student attempts nor authored content is changed.
const editor = process.env.MODU_PARITY_EDITOR_URL ?? 'http://localhost:8000';
const source = process.env.MODU_PARITY_PROBLEM ?? 'ko/TS_01.초등학교 3학년_01.객관식/2학기_01단원_곱셈/S3_elem_3_008540.dsl.py';
const longOptions = 'ko/TS_01.초등학교 3학년_01.객관식/1학기_01단원_덧셈과 뺄셈/P3_1_01_00040_15472.dsl.py';
const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});

async function checkTextFits(locator, expectedText) {
  const { text, fits } = await locator.evaluate(async (box) => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const content = box.querySelector('span');
    const range = document.createRange();
    range.selectNodeContents(content);
    const letters = range.getBoundingClientRect();
    const lineBox = content.getBoundingClientRect();
    const bounds = box.getBoundingClientRect();
    const frame = box.closest('.modu-student-canvas-frame').getBoundingClientRect();
    return {
      text: content.textContent,
      fits: letters.left >= bounds.left - 1 && letters.right <= bounds.right + 1
        && lineBox.top >= bounds.top - 1 && lineBox.bottom <= bounds.bottom + 1
        && letters.left >= frame.left - 1 && letters.right <= frame.right + 1,
    };
  });
  assert.equal(text, expectedText);
  assert.ok(fits, `Text exceeds its canvas box: ${text}`);
}

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

  await page.goto(`${editor}/editor-konva/?problem=${encodeURIComponent(longOptions)}`);
  await page.getByTitle(longOptions, { exact: true }).waitFor();
  await page.getByRole('button', { name: '앱처럼 풀어보기', exact: true }).click();
  const options = preview.locator('[data-canvas-text-box="slot.options.text"]');
  const expectedOptions = '<보기>    325,   532,   334,   985,   415';
  await checkTextFits(options, expectedOptions);
  await preview.getByRole('button', { name: '모바일', exact: true }).click();
  await page.waitForFunction(() => {
    const surface = document.querySelector('.student-preview-surface.viewport-mobile');
    return surface && surface.clientWidth <= 430 && surface.scrollWidth === surface.clientWidth;
  });
  await checkTextFits(options, expectedOptions);
  assert.equal(await preview.locator('[data-slot-id]').count(), 2);

  await page.setViewportSize({ width: 280, height: 640 });
  await page.goto(`${editor}/student/?studentPreview=1`);
  await page.locator('.student-empty').waitFor();
  const lines = '첫째 줄 WWWW\n둘째 줄 1234567890\n마지막 줄';
  await page.evaluate((text) => {
    window.postMessage({ type: 'modu-math:student-content', content: {
      id: 'text-fit-regression',
      renderer_data: {
        view_box: { width: 240, height: 160 },
        elements: [
          { id: 'multiline', type: 'text_box', text, attributes: {
            x: 14, y: 20, width: 100, height: 45, 'font-size': 24,
            'data-text-align': 'right', 'data-vertical-align': 'bottom',
          } },
          { id: 'fits-at-authored-size', type: 'text_box', text: '123', attributes: {
            x: 140, y: 30, width: 65, height: 35, 'font-size': 18,
          } },
          { id: 'reference-frame', type: 'rect', attributes: {
            x: 0, y: 0, width: 240, height: 160, stroke: '#111', fill: 'none',
          } },
        ],
      },
    } }, window.location.origin);
  }, lines);
  await checkTextFits(page.locator('[data-canvas-text-box="multiline"]'), lines);
  const fittingText = page.locator('[data-canvas-text-box="fits-at-authored-size"]');
  await checkTextFits(fittingText, '123');
  assert.equal(await fittingText.locator('span').evaluate((span) => getComputedStyle(span).transform), 'none');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 280);
  assert.deepEqual(errors, []);
  console.log(`Student parity, choice grading, and responsive canvas text fitting passed. Screenshot: ${output}`);
} finally {
  await browser.close();
}
