import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirm, formatCards, formatLocalDate, formatStatus, render, requireId, show } from './terminal.js';

test('IDs must be positive safe integers', () => {
  assert.equal(requireId('42', 'quiz'), 42);
  for (const value of ['0', '-2', '1.5', 'abc', '9007199254740992', '']) {
    assert.throws(() => requireId(value, 'quiz'), /quiz/);
  }
});

test('terminal rendering decodes HTML and strips control characters', () => {
  assert.equal(render('<p>A &amp; B <strong>c</strong></p><p>second \x1b[31m</p>'), 'A & B c\nsecond');
  assert.equal(render('<a href="https://example.org/file">Notes</a>'), 'Notes (https://example.org/file)');
  assert.equal(render('<a href="javascript:alert(1)">Unsafe</a>'), 'Unsafe');
});

test('missing Moodle descriptions render as empty text', () => {
  assert.equal(render(undefined), '');
  assert.equal(render(''), '');
  assert.equal(render('Plain text'), 'Plain text');
});

test('card output stays readable without a TTY and sanitizes untrusted text', () => {
  assert.equal(formatCards('Bài tập\x1b[31m', [{ title: 'Bài cuối kỳ', lines: ['Hạn: 29/10/2026 07:00', 'URL: https://example.org'] }]),
    'Bài tập\n\nBài cuối kỳ\n  Hạn: 29/10/2026 07:00\n  URL: https://example.org');
  assert.equal(formatCards('Môn học', []), 'Môn học\n\nKhông có mục nào.');
});

test('card headings use color only on a TTY when NO_COLOR is unset', () => {
  const previousTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  const previousNoColor = process.env.NO_COLOR;
  try {
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    process.env.NO_COLOR = '';
    assert.doesNotMatch(formatCards('Môn học', []), /\x1b\[/);
    delete process.env.NO_COLOR;
    assert.match(formatCards('Môn học', []), /\x1b\[1;36mMôn học\x1b\[0m/);
  } finally {
    if (previousTTY) Object.defineProperty(process.stdout, 'isTTY', previousTTY);
    else delete (process.stdout as unknown as { isTTY?: boolean }).isTTY;
    if (previousNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previousNoColor;
  }
});

test('Unix dates display in Ho Chi Minh time and missing values stay explicit', () => {
  assert.equal(formatLocalDate(Date.UTC(2026, 9, 29, 0) / 1000), '29/10/2026 07:00');
  assert.equal(formatLocalDate(0), 'Không đặt');
  assert.equal(formatLocalDate(undefined), 'Không đặt');
});

test('known Moodle statuses use student-friendly labels and unknown states survive', () => {
  assert.equal(formatStatus('submitted'), 'Đã nộp');
  assert.equal(formatStatus('inprogress'), 'Đang làm');
  assert.equal(formatStatus('not-in-progress'), 'Chưa bắt đầu');
  assert.equal(formatStatus('future-state'), 'future-state');
});

test('confirmation fails closed without an interactive terminal', async () => {
  assert.equal(await confirm('Continue?'), false);
});

test('JSON output escapes untrusted control characters', (t) => {
  const lines: string[] = [];
  t.mock.method(console, 'log', (line: string) => lines.push(line));
  show({ name: 'x\x1by' }, { json: true });
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).name, 'x\x1by');
  assert.ok(!lines[0].includes('\x1b'));
});
