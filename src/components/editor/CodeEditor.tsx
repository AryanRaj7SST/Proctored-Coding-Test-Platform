'use client';

import * as React from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';

export type CodeLanguage = 'html' | 'css' | 'javascript';

/**
 * CodeMirror 6, not Monaco.
 *
 * Monaco's React wrapper (@monaco-editor/react) fetches the actual editor
 * bundle from a CDN at runtime by default, which this app's own
 * Content-Security-Policy (script-src 'self') correctly refuses to load --
 * and self-hosting Monaco's ~30MB AMD bundle adds a postinstall step and a
 * dedicated static-asset path that's one more thing to misconfigure across
 * environments. CodeMirror ships as ordinary ES modules: `npm install` pulls
 * it in, Next.js bundles it into the app's own JS like any other dependency,
 * and it runs with zero runtime network dependency and no CSP exception
 * needed. For an editor that only needs HTML/CSS/JS syntax highlighting (no
 * IntelliSense, no multi-file project awareness) this is the right tool, not
 * a downgrade.
 */

const LANGUAGE_EXTENSIONS: Record<CodeLanguage, () => Extension> = {
  html: () => html(),
  css: () => css(),
  javascript: () => javascript(),
};

const baseTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: '#131f30', color: '#e2e8f0' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineHeight: '20px',
    overflow: 'auto',
    backgroundColor: '#131f30',
  },
  '.cm-content': { padding: '10px 0' },
  '.cm-gutters': {
    backgroundColor: '#131f30',
    color: '#475569',
    borderRight: '1px solid #1a273a',
  },
  '.cm-activeLine': { backgroundColor: '#18273d55' },
  '.cm-activeLineGutter': { backgroundColor: '#18273d55', color: '#94a3b8' },
});

export function CodeEditor({
  value,
  language,
  onChange,
  readOnly = false,
  preventPaste = false,
  onPasteAttempt,
  onSaveShortcut,
  onRunShortcut,
  height = '100%',
}: {
  value: string;
  language: CodeLanguage;
  onChange: (next: string) => void;
  readOnly?: boolean;
  preventPaste?: boolean;
  onPasteAttempt?: () => void;
  onSaveShortcut?: () => void;
  onRunShortcut?: () => void;
  height?: string | number;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<EditorView | null>(null);

  // Refs so the keymap and change handler always call the latest callback
  // without forcing the whole editor to remount every render.
  const onChangeRef = React.useRef(onChange);
  const saveRef = React.useRef(onSaveShortcut);
  const runRef = React.useRef(onRunShortcut);
  const pasteAttemptRef = React.useRef(onPasteAttempt);
  const preventPasteRef = React.useRef(preventPaste);
  onChangeRef.current = onChange;
  saveRef.current = onSaveShortcut;
  runRef.current = onRunShortcut;
  pasteAttemptRef.current = onPasteAttempt;
  preventPasteRef.current = preventPaste;

  // Mount once per (language, readOnly) pair. In practice each tab (HTML/CSS/
  // JS) already gets its own <CodeEditor> instance keyed by the caller, and
  // readOnly only flips once (on submit), so this is not a hot path.
  React.useEffect(() => {
    if (!hostRef.current) return;

    const shortcutKeymap = keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          saveRef.current?.();
          return true;
        },
      },
      {
        key: 'Mod-Enter',
        preventDefault: true,
        run: () => {
          runRef.current?.();
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: value,
      extensions: [
        shortcutKeymap, // placed first so it takes precedence over basicSetup's bindings
        basicSetup,
        LANGUAGE_EXTENSIONS[language](),
        oneDark,
        baseTheme,
        EditorView.lineWrapping,
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        EditorView.contentAttributes.of({ 'aria-label': `${language} editor` }),
        cmPlaceholder(readOnly ? '' : `Write your ${language.toUpperCase()} here...`),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        // A second line of defence: during a test the page-level proctor guard
        // already stops these events before they reach the editor.
        EditorView.domEventHandlers({
          paste(event) {
            if (preventPasteRef.current) {
              event.preventDefault();
              pasteAttemptRef.current?.();
              return true;
            }
            return false;
          },
          drop(event) {
            if (preventPasteRef.current) {
              event.preventDefault();
              pasteAttemptRef.current?.();
              return true;
            }
            return false;
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only remount on language/readOnly change
  }, [language, readOnly]);

  // Keep the document in sync with external value changes (switching
  // questions, "Reset starter code") without fighting the user's own typing:
  // only dispatch when the prop actually differs from what's on screen.
  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return (
    <div
      ref={hostRef}
      style={{ height }}
      className="h-full overflow-hidden"
      onPaste={(e) => {
        if (preventPaste) {
          e.preventDefault();
          pasteAttemptRef.current?.();
        }
      }}
    />
  );
}
