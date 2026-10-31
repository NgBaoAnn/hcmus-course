import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AgentSession } from './agent.js';

test('agent mode emits parseable preview, consent, result, and input events', async () => {
  const lines: string[] = [];
  const answers = ['yes', '2'];
  const session = new AgentSession('assignment.submit', {
    interactive: true,
    readInput: async () => answers.shift() ?? '',
    write: line => lines.push(line),
  });
  assert.equal(await session.confirm('File: report.pdf', 'submit'), true);
  assert.equal(await session.ask('Choose answer'), '2');
  session.result({ state: 'submitted', id: 4 });
  const events = lines.map(line => JSON.parse(line));
  assert.deepEqual(events.map(event => event.event), ['preview', 'confirmation_required', 'input_required', 'result']);
  assert.deepEqual(events[0], { schema: 1, event: 'preview', operation: 'assignment.submit', stage: 'submit', preview: 'File: report.pdf' });
  assert.equal(events[3].result.state, 'submitted');
});

test('agent mode refuses noninteractive writes and a declined preview', async () => {
  assert.throws(() => new AgentSession('messages.send', { interactive: false }), /terminal tương tác/);
  const lines: string[] = [];
  const session = new AgentSession('messages.send', { interactive: true, readInput: async () => 'no', write: line => lines.push(line) });
  assert.equal(await session.confirm('Message'), false);
  session.error(new Error('Đã hủy'));
  assert.equal(lines.map(line => JSON.parse(line).event).join(','), 'preview,confirmation_required,error');
  assert.equal(JSON.parse(lines[2]).code, 'cancelled');
});

test('agent mode accepts piped stdin when interactive is not set', () => {
  const session = new AgentSession('assignment.submit', {
    readInput: async () => 'yes',
    write: () => {},
  });
  assert.ok(session);
});
