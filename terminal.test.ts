import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirm, render, requireId, show } from './terminal.js';

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
