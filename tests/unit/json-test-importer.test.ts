import { describe, it, expect } from 'vitest';
import { buildLlmPrompt } from '@/components/admin/questions/JsonTestImporterModal';
import { validateTestCaseBody } from '@shared/test-spec';

describe('JsonTestImporter & buildLlmPrompt', () => {
  it('builds a comprehensive prompt with question context and DSL rules', () => {
    const prompt = buildLlmPrompt({
      title: 'Counter App',
      description: 'Make a counter that increments on click.',
      instructions: 'Clicking the button must increment #count by 1.',
      starterHtml: '<button id="btn">Add</button><span id="count">0</span>',
      starterCss: '#btn { color: red; }',
      starterJs: 'console.log("ready");',
    });

    expect(prompt).toContain('TITLE: Counter App');
    expect(prompt).toContain('Make a counter that increments on click.');
    expect(prompt).toContain('Clicking the button must increment #count by 1.');
    expect(prompt).toContain('<button id="btn">Add</button>');
    expect(prompt).toContain('AVAILABLE USER ACTIONS ("steps")');
    expect(prompt).toContain('AVAILABLE CHECKS ("assertions")');
    expect(prompt).toContain('"testCode"');
    expect(prompt).toContain('Return ONLY a valid JSON array');
  });

  it('validates a correct test case body with steps and assertions', () => {
    const testBody = {
      steps: [{ action: 'click', selector: '#btn' }],
      assertions: [
        { type: 'exists', selector: '#count' },
        { type: 'text', selector: '#count', equals: '1' },
      ],
    };

    const res = validateTestCaseBody(testBody);
    expect(res.ok).toBe(true);
  });

  it('rejects an invalid assertion type', () => {
    const testBody = {
      assertions: [
        { type: 'invalidType', selector: '#count' },
      ],
    };

    const res = validateTestCaseBody(testBody);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors[0]).toContain('unknown assertion type');
    }
  });

  it('accepts stringified JSON test body', () => {
    const jsonStr = JSON.stringify({
      assertions: [{ type: 'visible', selector: '#modal' }],
    });

    const res = validateTestCaseBody(jsonStr);
    expect(res.ok).toBe(true);
  });
});
