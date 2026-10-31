import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATES, SIZES, THEMES, ACCENTS, ROLES, VARIANTS } from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const POSTS_DIR = join(REPO_ROOT, "posts");

const EXAMPLE_FILES = [
  "frase-crm-que-o-time-usa.json",
  "carrossel-follow-up-whatsapp.json",
  "lista-5-indicadores-semanais.json",
];

interface Field {
  name: string;
  type: string;
  req: string;
  desc: string;
}

const POST_FIELDS: Field[] = [
  { name: "slug", type: "string", req: "obrigatório", desc: "kebab-case; nome base dos arquivos de saída" },
  { name: "brand", type: "string", req: "obrigatório", desc: "slug da marca (brands/<brand>.json)" },
  { name: "template", type: TEMPLATES.join(" | "), req: "obrigatório", desc: "qual template renderiza o post" },
  { name: "size", type: SIZES.join(" | "), req: "default 1080x1350", desc: "dimensão do criativo" },
  { name: "theme", type: THEMES.join(" | "), req: "default light", desc: "fundo do post (cor ou gradiente)" },
  { name: "accent", type: ACCENTS.join(" | "), req: "default primary", desc: "cor de destaque de kicker, números e blocos" },
  { name: "watermark", type: "symbol | none", req: "opcional", desc: "sobrescreve o padrão da marca no carousel-edu; símbolo gigante atrás do texto em fundos claros" },
  { name: "signature.enabled", type: "boolean", req: "default true", desc: "mostra a assinatura da marca" },
  { name: "signature.onlyLastSlide", type: "boolean", req: "default true", desc: "assinatura só no último slide" },
  { name: "slides", type: "Slide[]", req: "obrigatório, min 1", desc: "lista de slides na ordem de exibição" },
];

const SLIDE_FIELDS: Field[] = [
  { name: "role", type: ROLES.join(" | "), req: "obrigatório", desc: "papel do slide no carrossel" },
  { name: "variant", type: "string", req: "obrigatório", desc: "layout; ver variantes válidas por template/role" },
  { name: "kicker", type: "string", req: "opcional", desc: "rótulo pequeno em uppercase acima do título" },
  { name: "title", type: "string", req: "opcional", desc: "título do slide" },
  { name: "body", type: "string", req: "opcional", desc: "parágrafos separados por \\n\\n (itens por \\n em summary-list)" },
  { name: "highlight", type: "string", req: "opcional", desc: "frase ou número em destaque" },
  { name: "number", type: "number", req: "opcional", desc: "ordem em listas (number-*)" },
  { name: "source", type: "string", req: "opcional", desc: "fonte do dado, exibida como rodapé" },
  { name: "cta", type: "string", req: "opcional", desc: "chamada para ação no slide de fechamento" },
  { name: "background", type: '{ type:"image", src:string, overlay?:0..1 }', req: "opcional", desc: "imagem de fundo com overlay escuro opcional" },
];

/** Todas as strings de variante (para o teste de cobertura). */
export function allVariants(): string[] {
  const set = new Set<string>();
  for (const tpl of TEMPLATES) {
    for (const role of ROLES) {
      for (const v of VARIANTS[tpl][role] ?? []) set.add(v);
    }
  }
  return [...set].sort();
}

function fieldTable(fields: Field[]): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const rows = fields.map((f) => `| \`${f.name}\` | ${esc(f.type)} | ${esc(f.req)} | ${esc(f.desc)} |`);
  return ["| campo | tipo | obrigatoriedade | descrição |", "|---|---|---|---|", ...rows].join("\n");
}

function variantsBlock(): string {
  const out: string[] = [];
  for (const tpl of TEMPLATES) {
    out.push(`### ${tpl}`);
    for (const role of ROLES) {
      const list = VARIANTS[tpl][role];
      if (!list || !list.length) continue;
      // quote-card repete as mesmas variantes em todos os papéis; mostra uma vez.
      if (tpl === "quote-card" && role !== "cover") continue;
      const label = tpl === "quote-card" ? "slide único" : role;
      out.push(`- **${label}:** ${list.map((v) => `\`${v}\``).join(", ")}`);
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

function examplesBlock(): string {
  const out: string[] = [];
  for (const file of EXAMPLE_FILES) {
    const path = join(POSTS_DIR, file);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8").trim();
    out.push(`### posts/${file}`);
    out.push("```json");
    out.push(content);
    out.push("```");
    out.push("");
  }
  return out.join("\n").trimEnd();
}

/** Gera o conteúdo completo de SCHEMA.md. */
export function generateSchemaMd(): string {
  return `# Post JSON — schema

Referência para escrever um Post JSON válido para o ig-pipeline.
Gerado de \`src/schema.ts\` por \`ig-render schema\`. Não editar à mão.

## Post

${fieldTable(POST_FIELDS)}

## Slide

${fieldTable(SLIDE_FIELDS)}

## Variantes válidas por template e role

A \`variant\` de cada slide precisa estar na lista do seu \`template\` + \`role\`.

${variantsBlock()}

## Regras

- \`body\` com mais de 60 palavras gera **aviso** (não bloqueia o render).
- Título de capa encolhe por nº de caracteres: ≤40 → 96px, ≤70 → 84px, senão 72px.
- \`summary-list\` (carousel-edu/close) usa \`body\` como itens separados por quebra de linha.
- Temas \`gradient-*\` e \`solid-blue\` usam texto branco e a versão do símbolo para fundo escuro; \`light\`/\`light-blue\`/\`yellow\` usam texto escuro e o símbolo azul.
- \`yellow\` (fundo \`colors.yellow\`) e \`solid-blue\` (fundo \`colors.primary\`) são **só temas de fundo**. O amarelo nunca vira cor de texto nem de accent.
- Accents \`cyan\`, \`red\` e \`purple\` vêm de \`colors.{cyan,red,purple}\` da marca. \`cyan\` e \`red\` só são aplicados a elementos grandes (números, barras, ícones, tags e títulos ≥ 56px); em kicker, CTA e texto de corpo o template cai para \`ink\` (tema claro) ou branco (tema escuro).
- Se a marca não define a cor exigida pelo \`theme\`/\`accent\` escolhido, o \`validate\` **falha** com mensagem clara (sem fallback silencioso).
- Carrosséis mostram contador \`n/total\` em todos os slides menos a capa.

## Saída

- Render local: \`out/<slug>/<slug>-<nn>.png\` (nn com dois dígitos) + \`out/<slug>/manifest.json\`.
- Upload: cada PNG sobe como \`<slug>-<nn>-<hash8>.png\`, onde \`hash8\` são os 8
  primeiros caracteres do SHA256 do arquivo. Conteúdo idêntico mantém a mesma
  chave; qualquer mudança gera uma chave nova. Isso contorna o cache imutável do
  Worker (\`max-age=31536000, immutable\`): re-renderizar um post com o mesmo slug
  produz URLs novas só para os slides que mudaram. Versões antigas não são
  removidas do bucket.
- As URLs com hash (uma por slide) ficam em \`manifest.urls[]\` e são o stdout de
  \`ig-render upload\` e \`ig-render pipeline\`.

## Exemplos completos

${examplesBlock()}
`;
}

/** Retorna as variantes que NÃO aparecem no markdown (deve ser vazio). */
export function missingVariants(md: string): string[] {
  return allVariants().filter((v) => !md.includes(`\`${v}\``));
}
