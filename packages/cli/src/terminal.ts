import { createInterface } from 'node:readline/promises';
import { parseHTML } from 'linkedom';

export function requireId(value: string | undefined, label: string): number {
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value ?? '') || !Number.isSafeInteger(id)) {
    throw new Error(`${label} phải là ID nguyên dương.`);
  }
  return id;
}

export function render(html: string | null | undefined): string {
  const { document } = parseHTML(String(html ?? ''));
  const body = document.documentElement?.localName === 'html' ? document.body : null;
  const root = body?.childNodes.length ? body : document;
  const walk = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent ?? '';
    if (node.nodeType !== 1 && node.nodeType !== 9) return '';
    const tag = (node as Element).localName?.toLowerCase();
    if (['script', 'style', 'template', 'input', 'button'].includes(tag)) return '';
    if (tag === 'br') return '\n';
    const content = Array.from(node.childNodes, walk).join('');
    if (tag === 'a') {
      const href = (node as Element).getAttribute('href');
      return /^https?:\/\//i.test(href ?? '') ? `${content} (${href})` : content;
    }
    if (tag === 'li') return `\n• ${content}`;
    return ['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'ul', 'ol', 'pre'].includes(tag)
      ? `${content}\n` : content;
  };
  return walk(root).replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const timezone = 'Asia/Ho_Chi_Minh';
const statuses: Record<string, string> = {
  new: 'Chưa nộp', 'not-submitted': 'Chưa nộp', draft: 'Bản nháp', submitted: 'Đã nộp', reopened: 'Được mở lại',
  inprogress: 'Đang làm', 'not-in-progress': 'Chưa bắt đầu', overdue: 'Quá hạn', finished: 'Đã hoàn thành',
  correct: 'Đúng', incorrect: 'Chưa đúng', partiallycorrect: 'Đúng một phần', needsgrading: 'Chờ chấm',
  abandoned: 'Đã bỏ', saved: 'Đã lưu', uncertain: 'Chưa xác định', conflict: 'Có xung đột', unsupported: 'Chưa hỗ trợ',
  expired: 'Hết hạn', unknown: 'Không rõ',
};

export function formatCards(title: string, cards: { title: string; lines: string[] }[]): string {
  const color = process.stdout.isTTY && process.env.NO_COLOR === undefined;
  const style = (value: string, code: string) => color ? `\x1b[${code}m${value}\x1b[0m` : value;
  const width = Math.max(16, Math.min(process.stdout.columns || 80, 100));
  const wrap = (value: string, limit: number) => value.split('\n').flatMap(line => {
    const words = line.trim().split(/\s+/u);
    if (!line.trim()) return [''];
    const rows: string[] = [];
    let row = '';
    for (const word of words) {
      if (row && Array.from(`${row} ${word}`).length > limit) { rows.push(row); row = ''; }
      if (/^https?:\/\//.test(word)) { if (row) rows.push(row); row = ''; rows.push(word); continue; }
      const chars = Array.from(word);
      while (chars.length > limit) rows.push(chars.splice(0, limit).join(''));
      row = row ? `${row} ${chars.join('')}` : chars.join('');
    }
    if (row) rows.push(row);
    return rows;
  });
  const rail = style('│', '2;36');
  const decorate = (value: string) => {
    if (/^https?:\/\//.test(value)) return style(value, '4;36');
    const match = /^([^:]{2,24}:)(.*)$/.exec(value);
    if (!match) return value;
    const tone = /^Trạng thái:/.test(match[1])
      ? /Quá hạn|Chưa đúng|Hết hạn|Không rõ/.test(match[2]) ? '1;31' : /Đã nộp|Đã hoàn thành|Đúng/.test(match[2]) ? '1;32' : '1;33'
      : undefined;
    return `${style(match[1], '2')}${tone ? style(match[2], tone) : match[2]}`;
  };
  const heading = [style('╔══ COURSE CLI', '1;36'),
    ...wrap(render(title), width - 3).map(line => `${style('║', '36')}  ${style(line, '1')}`),
    style(`╚${'═'.repeat(width - 1)}`, '36')].join('\n');
  const body = cards.length ? cards.map((card, index) => {
    const marker = cards.length > 1 ? `${String(index + 1).padStart(2, '0')}  ` : '';
    const safeTitle = render(card.title);
    const titleTone = /Quá hạn|Hết hạn|Chưa đúng/.test(safeTitle) ? '1;31'
      : /Đã nộp|Đã hoàn thành/.test(safeTitle) ? '1;32' : '1';
    const titleRows = wrap(safeTitle, width - marker.length - 4);
    const rows = [`${style('╭─', '36')} ${style(marker + (titleRows.shift() ?? ''), titleTone)}`,
      ...titleRows.map(line => `${rail}  ${style(line, titleTone)}`)];
    for (const line of card.lines) {
      const safe = render(line);
      if (safe) rows.push(...wrap(safe, width - 4).map(part => `${rail}  ${decorate(part)}`));
    }
    rows.push(style(`╰${'─'.repeat(width - 1)}`, '2;36'));
    return rows.join('\n');
  }).join('\n\n') : `${style('╭─', '36')} Không có mục nào.\n${style(`╰${'─'.repeat(width - 1)}`, '2;36')}`;
  return `${heading}\n\n${body}`;
}

export async function withProgress<T>(label: string, work: () => Promise<T>): Promise<T> {
  if (!process.stderr.isTTY) return work();
  const frames = ['◐', '◓', '◑', '◒'];
  const message = render(label);
  let index = 0;
  let shown = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  const paint = () => { shown = true; process.stderr.write(`\r\x1b[2K${frames[index++ % frames.length]} ${message}`); };
  const delay = setTimeout(() => { paint(); interval = setInterval(paint, 120); }, 300);
  try { return await work(); }
  finally {
    clearTimeout(delay);
    if (interval) clearInterval(interval);
    if (shown) process.stderr.write('\r\x1b[2K');
  }
}

export function formatLocalDate(timestamp: number | null | undefined): string {
  if (timestamp == null || !Number.isFinite(timestamp) || timestamp <= 0) return 'Không đặt';
  const date = new Date(timestamp * 1000);
  if (!Number.isFinite(date.getTime())) return 'Không đặt';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone,
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

export function formatStatus(status: string): string {
  return statuses[status] ?? status;
}

export async function ask(message: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('Lệnh này cần terminal tương tác.');
  const io = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await io.question(`${render(message)} `);
  } finally {
    io.close();
  }
}

export async function confirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const answer = await ask(`${message}\nNhập yes để xác nhận:`);
  return answer.trim().toLowerCase() === 'yes';
}

export function show(value: unknown, { json = false }: { json?: boolean } = {}): void {
  console.log(json || typeof value !== 'string' ? JSON.stringify(value, null, 2) : render(value));
}
