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
