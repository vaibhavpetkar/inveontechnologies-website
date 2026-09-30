import type { EditorLanguage } from "../../internships/exercises/types.js";

/** File types accepted for an upload, by the question's editor language. */
export const FILE_TYPES: Record<EditorLanguage, string[]> = {
  c: [".c", ".h", ".txt"],
  cpp: [".cpp", ".cc", ".cxx", ".h", ".hpp", ".txt"],
  csharp: [".cs", ".txt"],
  java: [".java", ".txt"],
  python: [".py", ".txt"],
  javascript: [".js", ".mjs", ".cjs", ".txt"],
  jsx: [".jsx", ".js", ".tsx", ".txt"],
  php: [".php", ".txt"],
  sql: [".sql", ".txt"],
  html: [".html", ".htm", ".txt"],
  css: [".css", ".txt"],
  bash: [".sh", ".bash", ".txt"],
  shell: [".sh", ".bash", ".txt"],
  yaml: [".yml", ".yaml", ".txt"],
  dockerfile: ["Dockerfile", ".dockerfile", ".txt"],
  hcl: [".tf", ".hcl", ".txt"],
  json: [".json", ".txt"],
  text: [".txt", ".md", ".sh"],
};

export function fileTypeAllowed(fileName: string, editor: EditorLanguage) {
  const name = fileName.toLowerCase();
  const types = FILE_TYPES[editor] ?? [".txt"];
  return types.some((t) => (t.startsWith(".") ? name.endsWith(t) : name === t.toLowerCase() || name.startsWith(`${t.toLowerCase()}.`) || name.endsWith(`.${t.toLowerCase()}`)));
}
