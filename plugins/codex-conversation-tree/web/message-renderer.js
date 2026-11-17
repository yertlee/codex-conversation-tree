const linkPattern = /^\[([^\]\n]+)\]\(([^\s)]+)\)/;

export function safeLink(href) {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

export function parseInline(source) {
  const parts = [];
  let rest = String(source ?? '');
  while (rest) {
    const code = rest.match(/^`([^`]+)`/);
    const link = rest.match(linkPattern);
    const strong = rest.match(/^\*\*([^*\n]+)\*\*/);
    const emphasis = rest.match(/^\*([^*\n]+)\*/);
    const token = code ? { type: 'code', text: code[1], length: code[0].length }
      : link ? { type: safeLink(link[2]) ? 'link' : 'text', text: safeLink(link[2]) ? link[1] : link[0], href: safeLink(link[2]), length: link[0].length }
      : strong ? { type: 'strong', text: strong[1], length: strong[0].length }
      : emphasis ? { type: 'em', text: emphasis[1], length: emphasis[0].length } : null;
    if (token) {
      parts.push({ type: token.type, text: token.text, ...token.href ? { href: token.href } : {} });
      rest = rest.slice(token.length);
    } else {
      const next = rest.slice(1).search(/[`*[\[]/);
      const length = next < 0 ? rest.length : next + 1;
      parts.push({ type: 'text', text: rest.slice(0, length) });
      rest = rest.slice(length);
    }
  }
  return parts;
}

function tableCells(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
}

function isTableDivider(line, count) {
  const cells = tableCells(line);
  return cells.length === count && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

export function parseBlocks(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^\s*```\s*([\w.+-]*)\s*$/);
    if (fence) {
      const content = []; i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) content.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push({ type: 'code', language: fence[1], text: content.join('\n') });
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); i++; continue; }
    if (line.includes('|') && i + 1 < lines.length) {
      const headers = tableCells(line);
      if (headers.length > 1 && isTableDivider(lines[i + 1], headers.length)) {
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
          const cells = tableCells(lines[i++]);
          rows.push(headers.map((_, column) => cells[column] ?? ''));
        }
        blocks.push({ type: 'table', headers, rows });
        continue;
      }
    }
    if (/^\s{0,3}>/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
      blocks.push({ type: 'quote', text: quoted.join('\n') });
      continue;
    }
    const list = line.match(/^\s{0,3}([-*+] |\d+\. )(.+)$/);
    if (list) {
      const ordered = /^\d/.test(list[1]); const items = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s{0,3}([-*+] |\d+\. )(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(item[2]); i++;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^\s*```\s*[\w.+-]*\s*$/.test(lines[i]) &&
      !/^\s{0,3}#{1,6}\s+/.test(lines[i]) && !/^\s{0,3}([-*+] |\d+\. )/.test(lines[i]) &&
      !/^\s{0,3}>/.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1], tableCells(lines[i]).length))) paragraph.push(lines[i++]);
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
    else { blocks.push({ type: 'paragraph', text: lines[i] }); i++; }
  }
  return blocks;
}

function appendInline(parent, source) {
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    if (index) parent.append(document.createElement('br'));
    for (const part of parseInline(line)) {
      if (part.type === 'text') { parent.append(document.createTextNode(part.text)); continue; }
      const tag = { code: 'code', strong: 'strong', em: 'em', link: 'a' }[part.type];
      const element = document.createElement(tag);
      element.textContent = part.text;
      if (part.type === 'link') { element.href = part.href; element.target = '_blank'; element.rel = 'noopener noreferrer'; }
      parent.append(element);
    }
  });
}

export function renderMarkdown(container, source) {
  container.replaceChildren();
  for (const block of parseBlocks(source)) {
    let element;
    if (block.type === 'code') {
      element = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = block.text;
      if (block.language) code.dataset.language = block.language;
      element.append(code);
    } else if (block.type === 'ul' || block.type === 'ol') {
      element = document.createElement(block.type);
      for (const item of block.items) { const li = document.createElement('li'); appendInline(li, item); element.append(li); }
    } else if (block.type === 'table') {
      element = document.createElement('div'); element.className = 'detail-table-scroll';
      const table = document.createElement('table');
      const head = document.createElement('thead'); const headerRow = document.createElement('tr');
      for (const value of block.headers) { const cell = document.createElement('th'); cell.scope = 'col'; appendInline(cell, value); headerRow.append(cell); }
      head.append(headerRow); table.append(head);
      const body = document.createElement('tbody');
      for (const row of block.rows) { const tr = document.createElement('tr'); for (const value of row) { const cell = document.createElement('td'); appendInline(cell, value); tr.append(cell); } body.append(tr); }
      table.append(body); element.append(table);
    } else if (block.type === 'quote') {
      element = document.createElement('blockquote'); appendInline(element, block.text);
    } else {
      element = document.createElement(block.type === 'heading' ? `h${block.level}` : 'p');
      appendInline(element, block.text);
    }
    container.append(element);
  }
}
