import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, parseInline, safeLink } from '../web/message-renderer.js';

test('common answer structure becomes headings, lists and code blocks', () => {
  const blocks = parseBlocks('## 结论\n\n先做 **A**。\n\n- 步骤一\n- 步骤二\n\n```js\nconst x = 1;\n```');
  assert.deepEqual(blocks, [
    { type: 'heading', level: 2, text: '结论' },
    { type: 'paragraph', text: '先做 **A**。' },
    { type: 'ul', items: ['步骤一', '步骤二'] },
    { type: 'code', language: 'js', text: 'const x = 1;' }
  ]);
});

test('inline formatting retains text and only activates safe links', () => {
  assert.deepEqual(parseInline('看 [文档](https://example.com/a) 与 `code` **重点**'), [
    { type: 'text', text: '看 ' },
    { type: 'link', text: '文档', href: 'https://example.com/a' },
    { type: 'text', text: ' 与 ' },
    { type: 'code', text: 'code' },
    { type: 'text', text: ' ' },
    { type: 'strong', text: '重点' }
  ]);
  assert.equal(safeLink('javascript:alert(1)'), null);
  assert.equal(safeLink('data:text/html,<script>'), null);
  assert.deepEqual(parseInline('[点我](javascript:alert)'), [{ type: 'text', text: '[点我](javascript:alert)' }]);
});

test('literal HTML and unclosed code fence remain text', () => {
  assert.deepEqual(parseBlocks('<img src=x onerror=alert(1)>\n\n```\n<script>bad</script>'), [
    { type: 'paragraph', text: '<img src=x onerror=alert(1)>' },
    { type: 'code', language: '', text: '<script>bad</script>' }
  ]);
});

test('answer tables preserve cells and escaped pipes', () => {
  assert.deepEqual(parseBlocks('| 方案 | 结果 |\n|:---|---:|\n| A | **通过** |\n| B | `x\\|y` |'), [
    { type: 'table', headers: ['方案', '结果'], rows: [['A', '**通过**'], ['B', '`x|y`']] }
  ]);
});

test('quoted advice forms a separate readable block without interpreting HTML', () => {
  assert.deepEqual(parseBlocks('说明：\n> 请确认 **范围**\n> <script>alert(1)</script>\n\n继续。'), [
    { type: 'paragraph', text: '说明：' },
    { type: 'quote', text: '请确认 **范围**\n<script>alert(1)</script>' },
    { type: 'paragraph', text: '继续。' }
  ]);
});
