import type { ReactNode } from "react";

/** Inline `code` and **bold**, rendered as elements (never as HTML). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith("`") ? <code key={m.index}>{t.slice(1, -1)}</code> : <strong key={m.index}>{t.slice(2, -2)}</strong>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "h"; level: 2 | 3; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "code"; lang: string; text: string };

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^```\s*([\w+#-]*)/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      while (++i < lines.length && !/^```/.test(lines[i])) body.push(lines[i]);
      blocks.push({ kind: "code", lang: fence[1], text: body.join("\n") });
      continue;
    }
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ kind: "h", level: h[1].length as 2 | 3, text: h[2] });
      continue;
    }
    const li = /^\s*(?:([-*])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const kind = li[1] ? "ul" : "ol";
      const prev = blocks[blocks.length - 1];
      if (prev && prev.kind === kind) prev.items.push(li[3]);
      else blocks.push({ kind, items: [li[3]] });
      continue;
    }
    if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  return blocks;
}

/** Lesson reading text: headings, lists, code blocks and paragraphs. */
export function Reading({ text }: { text: string }) {
  return (
    <div className="player-text reading">
      {parse(text).map((b, i) => {
        switch (b.kind) {
          case "h":
            return b.level === 2 ? <h2 key={i}>{inline(b.text)}</h2> : <h3 key={i}>{inline(b.text)}</h3>;
          case "ul":
            return <ul key={i}>{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>;
          case "ol":
            return <ol key={i}>{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>;
          case "code":
            return <pre key={i} className="reading-code" data-lang={b.lang || undefined}><code>{b.text}</code></pre>;
          default:
            return <p key={i}>{inline(b.text)}</p>;
        }
      })}
    </div>
  );
}
