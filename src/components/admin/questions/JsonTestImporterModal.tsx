'use client';

import * as React from 'react';
import { Copy, Check, Sparkles, Code2, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button, Modal, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { validateTestCaseBody } from '@shared/test-spec';
import { newKey } from './draft';
import type { DraftTest, QuestionDraft } from './types';

export interface JsonTestImporterModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (newTests: DraftTest[]) => void;
  existingNames: string[];
  questionDraft?: Partial<QuestionDraft>;
}

const SAMPLE_TEST_CASES_JSON = JSON.stringify(
  [
    {
      name: 'Initial button and counter exist',
      description: 'Checks that key DOM elements are present upon load',
      expectedBehavior:
        'The page should display a counter element with id "count" and an increment button with id "btn-inc"',
      enabled: true,
      testCode: {
        assertions: [
          { type: 'exists', selector: '#count', message: 'Element #count is missing' },
          { type: 'exists', selector: '#btn-inc', message: 'Element #btn-inc is missing' },
          { type: 'text', selector: '#count', equals: '0' },
        ],
      },
    },
    {
      name: 'Clicking button increments counter',
      description: 'Simulates user clicking the increment button',
      expectedBehavior: 'When the user clicks #btn-inc, the text of #count should become "1"',
      enabled: true,
      testCode: {
        steps: [{ action: 'click', selector: '#btn-inc' }],
        assertions: [
          {
            type: 'text',
            selector: '#count',
            equals: '1',
            message: 'Counter did not update to 1 after click',
          },
        ],
      },
    },
  ],
  null,
  2,
);

export function buildLlmPrompt(draft?: Partial<QuestionDraft>): string {
  const title = draft?.title?.trim() || 'Interactive Web Component';
  const description =
    draft?.description?.trim() || 'Build an interactive web component matching the requirements.';
  const instructions = draft?.instructions?.trim() || '';
  const starterHtml = draft?.starterHtml?.trim() || '';
  const starterCss = draft?.starterCss?.trim() || '';
  const starterJs = draft?.starterJs?.trim() || '';
  const refHtml = draft?.referenceHtml?.trim() || '';
  const refCss = draft?.referenceCss?.trim() || '';
  const refJs = draft?.referenceJs?.trim() || '';

  let prompt = `You are an expert test suite author for automated web development grading.
I need you to generate behavioral test cases in our platform's exact JSON format for the coding challenge below.

================================================================================
PROBLEM DETAILS
================================================================================
TITLE: ${title}

DESCRIPTION:
${description}
`;

  if (instructions) {
    prompt += `\nINSTRUCTIONS:\n${instructions}\n`;
  }

  if (starterHtml || starterCss || starterJs) {
    prompt += `\nSTARTER CODE GIVEN TO STUDENTS:`;
    if (starterHtml) prompt += `\nHTML:\n\`\`\`html\n${starterHtml}\n\`\`\``;
    if (starterCss) prompt += `\nCSS:\n\`\`\`css\n${starterCss}\n\`\`\``;
    if (starterJs) prompt += `\nJavaScript:\n\`\`\`javascript\n${starterJs}\n\`\`\``;
    prompt += `\n`;
  }

  if (refHtml || refCss || refJs) {
    prompt += `\nREFERENCE SOLUTION:`;
    if (refHtml) prompt += `\nHTML:\n\`\`\`html\n${refHtml}\n\`\`\``;
    if (refCss) prompt += `\nCSS:\n\`\`\`css\n${refCss}\n\`\`\``;
    if (refJs) prompt += `\nJavaScript:\n\`\`\`javascript\n${refJs}\n\`\`\``;
    prompt += `\n`;
  }

  prompt += `
================================================================================
TEST SYSTEM SPECIFICATION & RULES
================================================================================
1. BEHAVIORAL TESTING ONLY:
   Tests run in a real browser sandbox (Playwright). They evaluate the RENDERED DOM, computed CSS, interaction results, and console errors.
   NEVER inspect the student's source code or functions (no source regex). Only test what the page does and displays!

2. OUTPUT FORMAT:
   Return ONLY a valid JSON array of test case objects.
   Each item in the array MUST follow this structure:
   [
     {
       "name": "Unique descriptive test title",
       "description": "Optional short note",
       "expectedBehavior": "Plain English description shown to students explaining what this test checks",
       "enabled": true,
       "testCode": {
         "viewport": { "width": 1280, "height": 720 },
         "steps": [
           // Optional user interaction steps executed sequentially before checks
         ],
         "assertions": [
           // Required array of checks. ALL checks in this test case must pass for it to pass.
         ]
       }
     }
   ]

3. AVAILABLE USER ACTIONS ("steps"):
   - Click: { "action": "click", "selector": "#btn", "nth": 0 }
   - Click by text: { "action": "clickText", "text": "Submit", "role": "button", "exact": true }
   - Fill input: { "action": "fill", "selector": "input#name", "value": "Alice" }
   - Press key: { "action": "press", "key": "Enter", "selector": "input" }
   - Hover: { "action": "hover", "selector": ".card" }
   - Wait: { "action": "wait", "ms": 300 }
   - Wait for element: { "action": "waitFor", "selector": ".modal", "state": "visible" } (states: "visible", "hidden", "attached")
   - Scroll to: { "action": "scrollTo", "selector": "#footer" }
   - Check checkbox: { "action": "check", "selector": "#terms" }
   - Uncheck: { "action": "uncheck", "selector": "#terms" }
   - Select option: { "action": "select", "selector": "select#country", "value": "IN" }
   - Viewport change: { "action": "setViewport", "viewport": { "width": 480, "height": 800 } }

4. AVAILABLE CHECKS ("assertions"):
   - Element exists: { "type": "exists", "selector": "#box", "message": "Optional message" }
   - Element not exists: { "type": "notExists", "selector": ".error" }
   - Visible: { "type": "visible", "selector": "#modal" }
   - Hidden: { "type": "hidden", "selector": "#loader" }
   - Element count: { "type": "count", "selector": ".todo-item", "equals": 3 }
   - Text content: { "type": "text", "selector": "h1", "equals": "Welcome" } OR { "contains": "Wel" }
   - Computed CSS: { "type": "css", "selector": ".box", "property": "background-color", "equals": "rgb(255, 0, 0)", "color": true }
     (Note: CSS colors are always computed as rgb/rgba strings)
   - CSS Numeric: { "type": "cssNumber", "selector": ".box", "property": "font-size", "op": "gte", "value": 16, "tolerance": 1 }
     (op: "eq" | "lt" | "lte" | "gt" | "gte")
   - Attribute value: { "type": "attribute", "selector": "a.link", "name": "target", "equals": "_blank" }
   - Element size: { "type": "size", "selector": ".card", "dimension": "width", "op": "gte", "value": 200 } (dimension: "width" | "height")
   - Grid columns: { "type": "gridColumns", "selector": ".grid", "equals": 3, "equalWidths": true }
   - Gap: { "type": "gap", "selector": ".grid", "equals": 16, "axis": "both" }
   - Boxes per row: { "type": "boxesPerRow", "selector": ".card", "equals": 3 }
   - No console errors: { "type": "noConsoleErrors" }
   - Has CSS class: { "type": "hasClass", "selector": "#btn", "className": "active" }
   - Not has CSS class: { "type": "notHasClass", "selector": "#btn", "className": "disabled" }
   - Input value: { "type": "value", "selector": "input#name", "equals": "John" }
   - Checked state: { "type": "checked", "selector": "input#agree", "equals": true }
   - Form validity: { "type": "validity", "selector": "input#email", "valid": true }
   - JS Evaluation: { "type": "js", "expression": "typeof calculateTotal === 'function' && calculateTotal(10, 5)", "equals": 15 }
   - Pure JS Function (isolated V8): { "type": "fn", "fn": "solve", "args": [1, 2], "expected": 3, "compare": "deepEqual" }
     (or simplified format: { "name": "Test 1", "fn": "solve", "args": [1, 2], "expected": 3, "compare": "deepEqual", "hidden": false })

5. TASK:
   Generate a complete, high-quality test suite (4 to 8 test cases) covering:
   - Initial DOM layout and expected elements
   - Key visual styles and responsiveness
   - Interactive events, user actions, and state transitions
   - Edge cases and error handling (if applicable)

Return ONLY the raw JSON array (or inside \`\`\`json \`\`\` code block). Do not include any explanations outside the JSON.`;

  return prompt;
}

interface ParsedCandidate {
  name: string;
  description: string;
  expectedBehavior: string;
  enabled: boolean;
  hidden: boolean;
  testCodeString: string;
}

export function JsonTestImporterModal({
  open,
  onClose,
  onImport,
  existingNames,
  questionDraft,
}: JsonTestImporterModalProps) {
  const toast = useToast();
  const [tab, setTab] = React.useState<'import' | 'prompt'>('import');
  const [jsonText, setJsonText] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const promptText = React.useMemo(() => buildLlmPrompt(questionDraft), [questionDraft]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      toast.push('LLM Prompt copied to clipboard! Paste it into any AI model.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.push('Failed to copy to clipboard.', 'error');
    }
  };

  // Strip markdown code fence if user copied ```json ... ```
  const cleanJsonInput = (input: string): string => {
    let text = input.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*/i, '');
      text = text.replace(/\s*```$/, '');
    }
    return text.trim();
  };

  // Parse and validate the user's input
  const parseResult = React.useMemo<{
    valid: boolean;
    error?: string;
    tests: ParsedCandidate[];
  }>(() => {
    const raw = cleanJsonInput(jsonText);
    if (!raw) {
      return { valid: false, tests: [] };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return {
        valid: false,
        error: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'Parse error'}`,
        tests: [],
      };
    }

    let items: unknown[] = [];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.tests)) {
        items = obj.tests;
      } else if (Array.isArray(obj.testCases)) {
        items = obj.testCases;
      } else {
        // Single test case object
        items = [obj];
      }
    } else {
      return {
        valid: false,
        error: 'Expected a JSON array of test cases or a single test case object.',
        tests: [],
      };
    }

    if (items.length === 0) {
      return { valid: false, error: 'The JSON contains no test cases.', tests: [] };
    }

    const candidates: ParsedCandidate[] = [];
    const validationErrors: string[] = [];

    items.forEach((item, idx) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        validationErrors.push(`Item #${idx + 1} must be a JSON object.`);
        return;
      }

      const rec = item as Record<string, unknown>;
      const name =
        typeof rec.name === 'string' && rec.name.trim()
          ? rec.name.trim()
          : `Test case ${existingNames.length + candidates.length + 1}`;
      const description = typeof rec.description === 'string' ? rec.description : '';
      const expectedBehavior = typeof rec.expectedBehavior === 'string' ? rec.expectedBehavior : '';
      const enabled = rec.enabled !== false;
      const hidden = Boolean(rec.hidden);

      // Extract testCode
      let bodyToValidate: unknown;
      let testCodeString: string;

      if (rec.testCode !== undefined) {
        if (typeof rec.testCode === 'string') {
          testCodeString = rec.testCode;
          bodyToValidate = rec.testCode;
        } else {
          testCodeString = JSON.stringify(rec.testCode, null, 2);
          bodyToValidate = rec.testCode;
        }
      } else if (typeof rec.fn === 'string' || (rec.type === 'fn' && typeof rec.fn === 'string')) {
        const fn = String(rec.fn).trim();
        const args = Array.isArray(rec.args) ? rec.args : [];
        const expected = rec.expected;
        const compare = typeof rec.compare === 'string' ? rec.compare : 'deepEqual';
        const fnAssertion: Record<string, unknown> = {
          type: 'fn',
          fn,
          args,
          expected,
          compare,
          ...(typeof rec.tolerance === 'number' ? { tolerance: rec.tolerance } : {}),
          ...(typeof rec.timeoutMs === 'number' ? { timeoutMs: rec.timeoutMs } : {}),
        };
        const bodyObj: Record<string, unknown> = {
          assertions: [fnAssertion],
          ...(typeof rec.timeoutMs === 'number' ? { timeoutMs: rec.timeoutMs } : {}),
        };
        testCodeString = JSON.stringify(bodyObj, null, 2);
        bodyToValidate = bodyObj;
      } else if (Array.isArray(rec.assertions)) {
        // Direct test body format where steps and assertions are top-level
        const bodyObj: Record<string, unknown> = {
          assertions: rec.assertions,
        };
        if (Array.isArray(rec.steps)) bodyObj.steps = rec.steps;
        if (rec.viewport && typeof rec.viewport === 'object') bodyObj.viewport = rec.viewport;
        testCodeString = JSON.stringify(bodyObj, null, 2);
        bodyToValidate = bodyObj;
      } else {
        validationErrors.push(`Test #${idx + 1} ("${name}"): Missing "fn", "testCode" or "assertions".`);
        return;
      }

      const valRes = validateTestCaseBody(bodyToValidate);
      if (!valRes.ok) {
        validationErrors.push(`Test #${idx + 1} ("${name}"): ${valRes.errors.join('; ')}`);
        return;
      }

      candidates.push({
        name,
        description,
        expectedBehavior,
        enabled,
        hidden,
        testCodeString,
      });
    });

    if (validationErrors.length > 0) {
      return {
        valid: false,
        error: validationErrors.join('\n'),
        tests: [],
      };
    }

    return {
      valid: candidates.length > 0,
      tests: candidates,
    };
  }, [jsonText, existingNames]);

  const handleImport = () => {
    if (!parseResult.valid || parseResult.tests.length === 0) return;

    const newDraftTests: DraftTest[] = parseResult.tests.map((cand) => ({
      _key: newKey(),
      name: cand.name,
      description: cand.description,
      expectedBehavior: cand.expectedBehavior,
      testCode: cand.testCodeString,
      enabled: cand.enabled,
      hidden: cand.hidden,
    }));

    onImport(newDraftTests);
    toast.push(`Successfully added ${newDraftTests.length} test case(s).`, 'success');
    setJsonText('');
    onClose();
  };

  const handleFormat = () => {
    try {
      const clean = cleanJsonInput(jsonText);
      const parsed = JSON.parse(clean);
      setJsonText(JSON.stringify(parsed, null, 2));
      toast.push('JSON formatted.', 'info');
    } catch {
      toast.push('Cannot format invalid JSON.', 'error');
    }
  };

  const handleLoadSample = () => {
    setJsonText(SAMPLE_TEST_CASES_JSON);
    toast.push('Sample test cases loaded.', 'info');
  };

  return (
    <Modal
      open={open}
      title="Advanced Test Case Tools: JSON & AI Prompt"
      onClose={onClose}
      className="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex gap-4 border-b border-slate-200 text-sm font-medium">
          <button
            type="button"
            onClick={() => setTab('import')}
            className={`flex items-center gap-2 border-b-2 pb-2.5 transition ${
              tab === 'import'
                ? 'border-blue-600 font-semibold text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Code2 className="h-4 w-4" />
            Paste & Import JSON
            {parseResult.valid ? <Badge tone="ok">{parseResult.tests.length} valid</Badge> : null}
          </button>
          <button
            type="button"
            onClick={() => setTab('prompt')}
            className={`flex items-center gap-2 border-b-2 pb-2.5 transition ${
              tab === 'prompt'
                ? 'border-blue-600 font-semibold text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="h-4 w-4 text-blue-600" />
            LLM Prompt Generator
          </button>
        </div>

        {/* Tab 1: Paste & Import JSON */}
        {tab === 'import' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                Paste a single test case object or an array of test cases generated by an LLM or copied from
                another question.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleFormat} disabled={!jsonText.trim()}>
                  Format JSON
                </Button>
                <Button variant="secondary" size="sm" onClick={handleLoadSample}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Load Sample
                </Button>
              </div>
            </div>

            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder={`Paste test cases JSON here (e.g. from ChatGPT/Claude)...\n[\n  {\n    "name": "Check heading",\n    "testCode": {\n      "assertions": [\n        { "type": "exists", "selector": "h1" }\n      ]\n    }\n  }\n]`}
              rows={12}
              className="shadow-2xs w-full rounded-lg border border-slate-300 bg-slate-50/50 p-3 font-mono text-xs leading-relaxed text-slate-900 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Validation Feedback */}
            {jsonText.trim() && parseResult.error ? (
              <div className="shadow-2xs flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <div className="space-y-1">
                  <p className="font-semibold text-rose-900">Validation Error:</p>
                  <pre className="whitespace-pre-wrap font-sans text-rose-700">{parseResult.error}</pre>
                </div>
              </div>
            ) : null}

            {parseResult.valid ? (
              <div className="shadow-2xs flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div className="space-y-1">
                  <p className="font-semibold text-emerald-900">
                    Ready to add {parseResult.tests.length} test case
                    {parseResult.tests.length === 1 ? '' : 's'}:
                  </p>
                  <ul className="list-inside list-disc space-y-0.5 font-medium text-emerald-700">
                    {parseResult.tests.map((t, idx) => (
                      <li key={idx} className="truncate">
                        {t.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!parseResult.valid || parseResult.tests.length === 0}>
                Import {parseResult.tests.length > 0 ? `${parseResult.tests.length} Test Case(s)` : ''}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Tab 2: LLM Prompt & Instructions */}
        {tab === 'prompt' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600">
                Copy this pre-formatted prompt and send it to any AI model (ChatGPT, Claude, Gemini,
                DeepSeek). It includes all DSL rules and the current question&apos;s details so the AI
                produces exact, valid test cases.
              </p>
              <Button variant="primary" size="sm" onClick={() => void copyPrompt()} className="shrink-0">
                {copied ? (
                  <>
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Copy LLM Prompt
                  </>
                )}
              </Button>
            </div>

            <div className="relative max-h-[50vh] select-all overflow-y-auto rounded-lg border border-slate-300 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">
              <pre className="whitespace-pre-wrap font-mono">{promptText}</pre>
            </div>

            <div className="space-y-1 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              <p className="flex items-center gap-1.5 font-semibold text-blue-950">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                How to use:
              </p>
              <ol className="list-inside list-decimal space-y-1 text-blue-800">
                <li>
                  Click <strong>Copy LLM Prompt</strong> above.
                </li>
                <li>Paste it into your favorite LLM (e.g. Claude 3.5 Sonnet, GPT-4o, or Gemini).</li>
                <li>Copy the JSON output returned by the LLM.</li>
                <li>
                  Switch to the <strong>Paste & Import JSON</strong> tab and paste it in to import instantly.
                </li>
              </ol>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-2">
              <Button variant="secondary" onClick={() => setTab('import')}>
                Back to Import
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
