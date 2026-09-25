import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuestionPanel, type StudentQuestion } from '@/components/exam/QuestionPanel';

describe('QuestionPanel Markdown / RichText Rendering', () => {
  it('renders #### headings as <h4> elements and inline code as <code> without literal #### or backticks', () => {
    const question: StudentQuestion = {
      id: 'q1',
      title: '2048 Game Styling',
      description: `### Requirements\n\n#### \`.game-board\`\n- Use CSS Grid (\`display: grid;\`).\n- Set gap: \`10px\`.`,
      instructions: null,
      mediaUrl: null,
      difficulty: 'MEDIUM',
      points: 100,
      starterHtml: '',
      starterCss: '',
      starterJs: '',
      publicTests: [],
      hiddenTestCount: 0,
    };

    const html = renderToStaticMarkup(React.createElement(QuestionPanel, { question }));

    // Must NOT contain raw markdown symbols
    expect(html).not.toContain('####');
    expect(html).not.toContain('###');
    expect(html).not.toContain('`.game-board`');
    expect(html).not.toContain('`display: grid;`');

    // Must contain proper semantic HTML tags
    expect(html).toContain('<h3');
    expect(html).toContain('Requirements</h3>');
    expect(html).toContain('<h4');
    expect(html).toContain('<code');
    expect(html).toContain('>.game-board</code>');
    expect(html).toContain('>display: grid;</code>');
    expect(html).toContain('<li');
  });

  it('renders markdown images as <img> tags instead of raw markdown text', () => {
    const question: StudentQuestion = {
      id: 'q1',
      title: '2048 Game Styling',
      description: `Style the game interface.\n\n![2048 Game Reference](https://d3dyfaf3iutrxo.cloudfront.net/thumbnail/assignment/question/cadc9666c939403998fc4b7153c5b350.png)\n\n### Next section`,
      instructions: null,
      mediaUrl: null,
      difficulty: 'MEDIUM',
      points: 100,
      starterHtml: '',
      starterCss: '',
      starterJs: '',
      publicTests: [],
      hiddenTestCount: 0,
    };

    const html = renderToStaticMarkup(React.createElement(QuestionPanel, { question }));

    expect(html).not.toContain('![2048 Game Reference]');
    expect(html).toContain('<img');
    expect(html).toContain(
      'src="https://d3dyfaf3iutrxo.cloudfront.net/thumbnail/assignment/question/cadc9666c939403998fc4b7153c5b350.png"',
    );
    expect(html).toContain('alt="2048 Game Reference"');
  });

  it('renders Q2 Arrange the divs and Q3 Profile Building correctly', () => {
    const q2: StudentQuestion = {
      id: 'q2',
      title: 'Arrange the divs',
      description: `Use CSS Grid to reproduce the layout.\n\n![Arrange the divs Reference](https://d3dyfaf3iutrxo.cloudfront.net/thumbnail/assignment/question/03020e7d3ddd47cb9d80a2fc91821a39.jpeg)\n\n### Requirements\n\n#### \`#grid-container\`\n- \`display: grid;\``,
      instructions: null,
      mediaUrl: null,
      difficulty: 'MEDIUM',
      points: 100,
      starterHtml: '',
      starterCss: '',
      starterJs: '',
      publicTests: [],
      hiddenTestCount: 0,
    };

    const html = renderToStaticMarkup(React.createElement(QuestionPanel, { question: q2 }));
    expect(html).not.toContain('![Arrange the divs Reference]');
    expect(html).not.toContain('####');
    expect(html).toContain('<img');
    expect(html).toContain(
      'src="https://d3dyfaf3iutrxo.cloudfront.net/thumbnail/assignment/question/03020e7d3ddd47cb9d80a2fc91821a39.jpeg"',
    );
    expect(html).toContain('<h4');
    expect(html).toContain('>#grid-container</code>');
  });
});
