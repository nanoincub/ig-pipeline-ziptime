import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Teste: falha se qualquer arquivo de template contiver caractere emoji.
 * O Satori não renderiza emoji (vira "tofu"); ícones devem ser SVG inline.
 * Roda no `pnpm build`.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "src", "templates");

// Emoji = Extended_Pictographic, exceto símbolos tipográficos comuns inofensivos.
const EMOJI = /\p{Extended_Pictographic}/u;

export interface EmojiHit {
  file: string;
  line: number;
  char: string;
}

export function findEmojiInTemplates(dir = TEMPLATES_DIR): EmojiHit[] {
  const hits: EmojiHit[] = [];
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!/\.(ts|tsx)$/.test(e.name)) continue;
    const parent = (e as { parentPath?: string; path?: string }).parentPath ?? (e as { path?: string }).path ?? dir;
    const full = join(parent, e.name);
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const ch of line) {
        if (EMOJI.test(ch)) hits.push({ file: full, line: i + 1, char: ch });
      }
    });
  }
  return hits;
}

// Executa só quando chamado direto (node dist/check-no-emoji.js), não em import.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const hits = findEmojiInTemplates();
  if (hits.length) {
    process.stderr.write(`✗ emoji encontrado em template(s):\n`);
    for (const h of hits) {
      process.stderr.write(`  ${h.file}:${h.line} -> "${h.char}" (U+${h.char.codePointAt(0)!.toString(16).toUpperCase()})\n`);
    }
    process.exit(1);
  }
  process.stderr.write("✓ nenhum emoji nos templates.\n");
}
