import { runOnRunner } from '../src/lib/runner-client';

async function main() {
  const html = '<body><div id="grid-container"><div class="grid-item" id="item1">Item 1</div><div class="grid-item" id="item2">Item 2</div><div class="grid-item" id="item3">Item 3</div><div class="grid-item" id="item4">Item 4</div></div></body>';
  const css = `#grid-container { display: grid; grid-template-columns: repeat(2, 50px); grid-template-rows: repeat(2, 50px); gap: 10px; }
.grid-item { background-color: rgb(173, 216, 230); border: 2px solid rgb(0, 0, 0); text-align: center; line-height: 50px; }
#item1 { grid-row: span 2; }`;

  const spec = {
    version: 1 as const,
    viewport: { width: 1280, height: 720 },
    tests: [
      {
        id: 't1',
        name: 'Styles the grid container correctly',
        points: 10,
        hidden: false,
        assertions: [
          { type: 'css' as const, selector: '#grid-container', property: 'display', equals: 'grid' },
          { type: 'css' as const, selector: '#grid-container', property: 'grid-template-columns', oneOf: ['50px 50px', 'repeat(2, 50px)'] },
          { type: 'css' as const, selector: '#grid-container', property: 'grid-template-rows', oneOf: ['50px 50px', 'repeat(2, 50px)'] },
          { type: 'css' as const, selector: '#grid-container', property: 'gap', oneOf: ['10px', '10px 10px'] },
        ],
      },
      {
        id: 't2',
        name: 'Styles the grid items correctly',
        points: 10,
        hidden: false,
        assertions: [
          { type: 'css' as const, selector: '.grid-item', property: 'background-color', color: true, equals: 'rgb(173, 216, 230)' },
          { type: 'css' as const, selector: '.grid-item', property: 'border', equals: '2px solid rgb(0, 0, 0)' },
          { type: 'css' as const, selector: '.grid-item', property: 'text-align', equals: 'center' },
          { type: 'css' as const, selector: '.grid-item', property: 'line-height', equals: '50px' },
        ],
      },
      {
        id: 't3',
        name: 'Applies grid-row to item1 correctly',
        points: 10,
        hidden: false,
        assertions: [
          { type: 'css' as const, selector: '#item1', property: 'grid-row', equals: 'span 2' },
        ],
      },
    ],
  };

  const res1 = await runOnRunner({ runId: 'smoke-test-1', html, css, js: '', spec });
  console.log('Q1 RESULT STATUS:', res1.status);
  console.log('Q1 TESTS:', res1.results);

  const q2Html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Grid Layout</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <div class="grid-container">
    <div class="box">Box 1</div>
    <div class="box">Box 2</div>
    <div class="box">Box 3</div>
    <div class="box">Box 4</div>
    <div class="box">Box 5</div>
    <div class="box">Box 6</div>
    <div class="box">Box 7</div>
    <div class="box">Box 8</div>
  </div>
</body>
</html>`;

  const q2Css = `.grid-container {
  display: grid;
  grid-template-columns: repeat(4, 100px);
  grid-template-rows: repeat(2, 100px);
  gap: 10px;
}
.box {
  background-color: rgb(173, 216, 230);
  border: 1px solid black;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: sans-serif;
  font-size: 16px;
}`;

  const q2Spec = {
    version: 1 as const,
    viewport: { width: 1280, height: 720 },
    tests: [
      {
        id: 'q2-t1',
        name: 'Verify Grid Container Exists',
        points: 5,
        hidden: false,
        assertions: [{ type: 'exists' as const, selector: '.grid-container' }],
      },
      {
        id: 'q2-t2',
        name: 'Verify Number of Boxes',
        points: 5,
        hidden: false,
        assertions: [{ type: 'count' as const, selector: '.box', equals: 8 }],
      },
      {
        id: 'q2-t3',
        name: 'Verify Box Text Sequence',
        points: 5,
        hidden: false,
        assertions: [
          { type: 'text' as const, selector: '.box:nth-child(1)', equals: 'Box 1' },
          { type: 'text' as const, selector: '.box:nth-child(8)', equals: 'Box 8' },
        ],
      },
      {
        id: 'q2-t4',
        name: 'Verify Grid Display Property',
        points: 5,
        hidden: false,
        assertions: [{ type: 'css' as const, selector: '.grid-container', property: 'display', equals: 'grid' }],
      },
      {
        id: 'q2-t5',
        name: 'Verify Grid Columns Count',
        points: 5,
        hidden: false,
        assertions: [{ type: 'gridColumns' as const, selector: '.grid-container', equals: 4 }],
      },
      {
        id: 'q2-t6',
        name: 'Verify Gap Between Boxes',
        points: 5,
        hidden: false,
        assertions: [{ type: 'gap' as const, selector: '.grid-container', equals: 10 }],
      },
      {
        id: 'q2-t7',
        name: 'Verify Box Square Shape',
        points: 5,
        hidden: false,
        assertions: [
          { type: 'size' as const, selector: '.box', dimension: 'width' as const, op: 'eq' as const, value: 100, tolerance: 2 },
          { type: 'size' as const, selector: '.box', dimension: 'height' as const, op: 'eq' as const, value: 100, tolerance: 2 },
        ],
      },
    ],
  };

  const res2 = await runOnRunner({ runId: 'smoke-test-2', html: q2Html, css: q2Css, js: '', spec: q2Spec });
  console.log('Q2 RESULT STATUS:', res2.status);
  console.log('Q2 TESTS:', res2.results);
}

main().catch(console.error);
