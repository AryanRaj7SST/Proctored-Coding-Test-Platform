import * as React from 'react';

/**
 * Helper to render inline markdown: `code`, **bold**, links, and plain text.
 */
function renderInline(str: string): React.ReactNode[] {
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = str.split(regex);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="rounded border border-slate-200/60 bg-slate-100 px-1 py-0.5 font-mono text-[11px] font-medium text-blue-600"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (linkMatch && linkMatch[1] && linkMatch[2]) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline hover:text-blue-700"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}

interface ParsedBlock {
  type: 'heading' | 'image' | 'list' | 'paragraph';
  level?: number;
  alt?: string;
  url?: string;
  items?: string[];
  text?: string;
}

function isSafeUrl(url: string): boolean {
  if (url.startsWith('/api/image-proxy')) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Render structured markdown safely without dangerouslySetInnerHTML.
 * Matches the pipeline used by QuestionPanel.
 */
export function MarkdownRenderer({ text }: { text: string }) {
  const blocks = React.useMemo(() => {
    const rawLines = text.replace(/\r\n/g, '\n').split('\n');
    const result: ParsedBlock[] = [];
    let currentList: string[] | null = null;
    let currentParagraph: string[] | null = null;

    const flushList = () => {
      if (currentList && currentList.length > 0) {
        result.push({ type: 'list', items: currentList });
        currentList = null;
      }
    };

    const flushParagraph = () => {
      if (currentParagraph && currentParagraph.length > 0) {
        result.push({ type: 'paragraph', text: currentParagraph.join(' ') });
        currentParagraph = null;
      }
    };

    for (const line of rawLines) {
      const trimmed = line.trim();

      if (!trimmed) {
        flushList();
        flushParagraph();
        continue;
      }

      // Explicit image
      const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(((?:https?:\/\/|\/api\/image-proxy)[^\s)]+)\)$/);
      if (imageMatch && imageMatch[1] !== undefined && imageMatch[2]) {
        flushList();
        flushParagraph();
        result.push({ type: 'image', alt: imageMatch[1], url: imageMatch[2] });
        continue;
      }

      // Headings: # to ######
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch && headingMatch[1] && headingMatch[2]) {
        flushList();
        flushParagraph();
        result.push({
          type: 'heading',
          level: headingMatch[1].length,
          text: headingMatch[2],
        });
        continue;
      }

      // List items: - item or * item
      const listMatch = trimmed.match(/^[-*]\s+(.*)$/);
      if (listMatch && listMatch[1]) {
        flushParagraph();
        if (!currentList) currentList = [];
        currentList.push(listMatch[1]);
        continue;
      }

      // Regular text
      flushList();
      if (!currentParagraph) currentParagraph = [];
      currentParagraph.push(trimmed);
    }

    flushList();
    flushParagraph();
    return result;
  }, [text]);

  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
      {blocks.map((block, i) => {
        if (block.type === 'image' && block.url) {
          if (!isSafeUrl(block.url)) return null;
          const imageSrc = block.url.startsWith('/api/image-proxy')
            ? block.url
            : `/api/image-proxy?url=${encodeURIComponent(block.url)}`;
          return (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={i}
              src={imageSrc}
              alt={block.alt || 'Illustration'}
              className="my-3 max-h-80 rounded object-contain"
              loading="lazy"
            />
          );
        }

        if (block.type === 'heading') {
          const content = renderInline(block.text || '');
          if (block.level === 1) {
            return (
              <h2 key={i} className="pt-2 text-lg font-bold text-slate-900">
                {content}
              </h2>
            );
          }
          if (block.level === 2) {
            return (
              <h3 key={i} className="pt-1.5 text-base font-bold text-slate-900">
                {content}
              </h3>
            );
          }
          return (
            <h4 key={i} className="pt-1 text-sm font-semibold text-slate-900">
              {content}
            </h4>
          );
        }

        if (block.type === 'list' && block.items) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 text-slate-700">
              {block.items.map((item, idx) => (
                <li key={idx}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === 'paragraph' && block.text) {
          return (
            <p key={i} className="text-slate-700">
              {renderInline(block.text)}
            </p>
          );
        }

        return null;
      })}
    </div>
  );
}
