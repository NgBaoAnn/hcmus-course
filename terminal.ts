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
  abandoned: 'Đã bỏ', saved: 'Đã lưu', uncertain: 'Chưa xác định', conflict: 'Có xung đột', unsupported: 'Chưa hỗ trợ',
  expired: 'Hết hạn', unknown: 'Không rõ',
};

export function formatCards(title: string, cards: { title: string; lines: string[] }[]): string {
  const color = process.stdout.isTTY && process.env.NO_COLOR === undefined;
  const style = (value: string, code: string) => color ? `\x1b[${code}m${value}\x1b[0m` : value;
  const heading = style(render(title), '1;36');
  const body = cards.map(card => [style(render(card.title), '1'), ...card.lines.map(line => `  ${render(line)}`)].join('\n')).join('\n\n');
  return `${heading}\n\n${body || 'Không có mục nào.'}`;
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
