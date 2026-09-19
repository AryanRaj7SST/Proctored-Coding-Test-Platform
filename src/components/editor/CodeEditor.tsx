"use client";

import Editor from "@monaco-editor/react";
import { useState } from "react";

type EditorTab = "html" | "css" | "js";
type CodeEditorProps = { initialHtml?: string; initialCss?: string; initialJs?: string; onChange?: (value: { html: string; css: string; js: string }) => void };
const languages: Record<EditorTab, string> = { html: "html", css: "css", js: "javascript" };

export default function CodeEditor({ initialHtml = "", initialCss = "", initialJs = "", onChange }: CodeEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>("html");
  const [code, setCode] = useState({ html: initialHtml, css: initialCss, js: initialJs });
  const updateCode = (value: string) => { const next = { ...code, [activeTab]: value }; setCode(next); onChange?.(next); };
  return <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="flex border-b bg-slate-50">{(Object.keys(languages) as EditorTab[]).map((tab) => <button key={tab} type="button" className="px-4 py-2 text-sm" onClick={() => setActiveTab(tab)}>{tab.toUpperCase()}</button>)}</div><Editor height="420px" language={languages[activeTab]} value={code[activeTab]} onChange={(value) => updateCode(value ?? "")} /></section>;
}
