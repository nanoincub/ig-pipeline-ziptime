#!/usr/bin/env node
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";
import { Command } from "commander";
import { parsePost, type Post } from "./schema.js";
import { loadBrand, type BrandTokens } from "./tokens.js";
import { loadFonts, renderPost, listPosts, type SatoriFont, type Manifest } from "./render.js";
import { buildContactSheet, collectSlidePngs } from "./contact-sheet.js";
import { loadUploadConfig, uploadSlug } from "./upload.js";
import {
  loadPublishConfig,
  loadManifestUrls,
  validateCaption,
  buildPlan,
  publishPost,
  GraphApiError,
  GRAPH_API_VERSION,
} from "./publish.js";
import { generateSchemaMd, missingVariants } from "./schema-doc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const POSTS_DIR = join(REPO_ROOT, "posts");

dotenvConfig({ path: join(REPO_ROOT, ".env") });

const program = new Command();
program.name("ig-render").description("Renderizador de criativos de Instagram a partir de JSON").version("0.1.0");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** progresso e diagnósticos vão para stderr; stdout fica reservado para URLs. */
function logErr(msg: string): void {
  process.stderr.write(msg + "\n");
}

/** Renderiza um post já parseado e devolve o manifest + timings. Logs em stderr. */
async function renderTarget(
  post: Post,
  tokens: BrandTokens,
  fonts: SatoriFont[],
  outRoot: string,
  opts: { debug?: boolean; postDir: string }
): Promise<{ manifest: Manifest; timings: number[]; outDir: string }> {
  const { manifest, timings, outDir } = await renderPost(post, tokens, fonts, outRoot, opts);
  const sum = timings.reduce((a, b) => a + b, 0);
  logErr(`✓ ${post.slug} — ${manifest.files.length} slide(s) em ${outDir}  (${Math.round(sum)}ms)`);
  return { manifest, timings, outDir };
}

// ---------- validate ----------
program
  .command("validate")
  .argument("<post.json>", "arquivo JSON do post")
  .description("valida o JSON do post sem renderizar")
  .action((postPath: string) => {
    const abs = resolve(process.cwd(), postPath);
    try {
      const { post, warnings } = parsePost(readJson(abs));
      logErr(`✓ ${post.slug} válido — template ${post.template}, ${post.slides.length} slide(s).`);
      for (const w of warnings) logErr(`  ⚠ ${w}`);
      process.exit(0);
    } catch (err) {
      logErr(`✗ ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ---------- render ----------
program
  .command("render")
  .argument("[files...]", "um ou mais JSONs (ou glob do shell)")
  .option("-b, --brand <slug>", "marca", "ziptime")
  .option("-o, --out <dir>", "diretório de saída", "out")
  .option("--all", "renderiza todos os posts em posts/")
  .option("--debug", "desenha a zona segura e grava em <out>/debug/")
  .action(async (files: string[], options: { brand: string; out: string; all?: boolean; debug?: boolean }) => {
    const tokens = loadBrand(options.brand);
    const fonts = loadFonts();

    let targets: string[] = [];
    if (options.all) targets = listPosts(POSTS_DIR);
    else if (files.length) targets = files.map((f) => resolve(process.cwd(), f));
    else {
      logErr("✗ informe arquivos ou use --all");
      process.exit(1);
    }
    if (!targets.length) {
      logErr("✗ nenhum post encontrado");
      process.exit(1);
    }

    const outRoot = options.debug
      ? join(resolve(process.cwd(), options.out), "debug")
      : resolve(process.cwd(), options.out);

    const allTimings: number[] = [];
    for (const target of targets) {
      if (!existsSync(target)) {
        logErr(`✗ arquivo não encontrado: ${target}`);
        process.exit(1);
      }
      const { post, warnings } = parsePost(readJson(target));
      if (post.brand !== options.brand) logErr(`  ⚠ ${post.slug}: brand "${post.brand}" difere de --brand "${options.brand}"`);
      for (const w of warnings) logErr(`  ⚠ ${post.slug}: ${w}`);
      const { timings } = await renderTarget(post, tokens, fonts, outRoot, { debug: options.debug, postDir: dirname(target) });
      allTimings.push(...timings);
    }

    const avg = allTimings.length ? allTimings.reduce((a, b) => a + b, 0) / allTimings.length : 0;
    logErr(`\n${allTimings.length} slide(s) renderizados. Tempo médio: ${avg.toFixed(1)}ms/slide.`);
  });

// ---------- upload ----------
program
  .command("upload")
  .argument("<slug>", "slug do post já renderizado em out/<slug>/")
  .option("-b, --brand <slug>", "marca", "ziptime")
  .option("-o, --out <dir>", "diretório de saída", "out")
  .description("sobe os PNGs de out/<slug>/ para o Worker e imprime as URLs")
  .action(async (slug: string, options: { brand: string; out: string }) => {
    const outRoot = resolve(process.cwd(), options.out);
    try {
      const cfg = loadUploadConfig();
      const urls = await uploadSlug(slug, options.brand, outRoot, cfg, logErr);
      for (const u of urls) process.stdout.write(u + "\n");
    } catch (err) {
      logErr(`✗ ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ---------- pipeline ----------
program
  .command("pipeline")
  .argument("<post.json>", "arquivo JSON do post")
  .option("-b, --brand <slug>", "marca", "ziptime")
  .option("-o, --out <dir>", "diretório de saída", "out")
  .option("--no-upload", "para no render, sem subir para o Worker")
  .description("validate + render + upload em um comando (URLs no stdout)")
  .action(async (postPath: string, options: { brand: string; out: string; upload: boolean }) => {
    const target = resolve(process.cwd(), postPath);
    try {
      if (!existsSync(target)) throw new Error(`arquivo não encontrado: ${target}`);
      const { post, warnings } = parsePost(readJson(target));
      logErr(`✓ ${post.slug} válido — template ${post.template}, ${post.slides.length} slide(s).`);
      for (const w of warnings) logErr(`  ⚠ ${w}`);

      const tokens = loadBrand(options.brand);
      const fonts = loadFonts();
      const outRoot = resolve(process.cwd(), options.out);
      await renderTarget(post, tokens, fonts, outRoot, { postDir: dirname(target) });

      if (!options.upload) {
        logErr("↪ --no-upload: parando após o render.");
        return;
      }
      const cfg = loadUploadConfig();
      const urls = await uploadSlug(post.slug, options.brand, outRoot, cfg, logErr);
      for (const u of urls) process.stdout.write(u + "\n");
    } catch (err) {
      logErr(`✗ ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ---------- publish ----------
program
  .command("publish")
  .argument("<slug>", "slug do post já renderizado e com upload feito (out/<slug>/)")
  .option("--caption-file <path>", "arquivo de legenda (padrão: posts/<slug>.caption.txt)")
  .option("--dry-run", "valida e imprime o plano de chamadas sem publicar")
  .option("-o, --out <dir>", "diretório de saída", "out")
  .description(`publica no Instagram via Graph API ${GRAPH_API_VERSION} (imagem única ou carrossel)`)
  .action(async (slug: string, options: { captionFile?: string; dryRun?: boolean; out: string }) => {
    try {
      const outRoot = resolve(process.cwd(), options.out);
      const { urls } = loadManifestUrls(slug, outRoot);

      const captionPath = options.captionFile
        ? resolve(process.cwd(), options.captionFile)
        : join(POSTS_DIR, `${slug}.caption.txt`);
      if (!existsSync(captionPath)) {
        throw new Error(
          `legenda não encontrada: ${captionPath}. Use --caption-file ou crie posts/${slug}.caption.txt.`
        );
      }
      const caption = readFileSync(captionPath, "utf8").trim();
      const { chars, hashtags } = validateCaption(caption);

      const { config, missing } = loadPublishConfig();
      const isCarousel = urls.length > 1;

      if (options.dryRun) {
        const plan = buildPlan(config?.userId ?? "{IG_USER_ID}", urls);
        logErr(`Plano de publicação (dry-run) — ${slug}`);
        logErr(`  tipo: ${isCarousel ? `carrossel (${urls.length} imagens)` : "imagem única"}`);
        logErr(`  legenda: ${chars} caracteres, ${hashtags} hashtags  [${captionPath}]`);
        logErr(`  containers: ${isCarousel ? `${urls.length} filhos + 1 pai` : "1"}`);
        logErr(`  credenciais: ${missing.length ? `AUSENTES (${missing.join(", ")})` : "presentes"}`);
        logErr(`  chamadas (${plan.length}):`);
        plan.forEach((s, i) =>
          logErr(`   ${String(i + 1).padStart(2, "0")}. ${s.method} ${s.url}${s.note ? `   # ${s.note}` : ""}`)
        );
        process.stdout.write(
          JSON.stringify({
            dry_run: true,
            slug,
            type: isCarousel ? "carousel" : "image",
            images: urls.length,
            containers: isCarousel ? { children: urls.length, parent: 1 } : { single: 1 },
            caption: { chars, hashtags },
            credentials: missing.length ? "missing" : "present",
            calls: plan.length,
          }) + "\n"
        );
        return;
      }

      if (!config) {
        throw new Error(`credenciais ausentes: ${missing.join(", ")}. Defina em .env (veja .env.example).`);
      }
      const result = await publishPost(config, urls, caption, logErr);
      process.stdout.write(JSON.stringify(result) + "\n");
    } catch (err) {
      if (err instanceof GraphApiError) {
        logErr(`✗ Graph API erro${err.code != null ? ` (code ${err.code})` : ""}: ${err.message}`);
      } else {
        logErr(`✗ ${(err as Error).message}`);
      }
      process.exit(1);
    }
  });

// ---------- contact-sheet ----------
program
  .command("contact-sheet")
  .option("-o, --out <dir>", "diretório onde estão os posts renderizados", "out")
  .description("monta <out>/contact-sheet.png com todos os slides em grade")
  .action(async (options: { out: string }) => {
    const outRoot = resolve(process.cwd(), options.out);
    const pngs = collectSlidePngs(outRoot);
    const dest = join(outRoot, "contact-sheet.png");
    const { width, height, count } = await buildContactSheet(pngs, dest);
    logErr(`✓ contact sheet: ${dest} (${width}x${height}, ${count} slides)`);
  });

// ---------- schema ----------
program
  .command("schema")
  .description("gera SCHEMA.md na raiz a partir do zod")
  .action(() => {
    const md = generateSchemaMd();
    const dest = join(REPO_ROOT, "SCHEMA.md");
    writeFileSync(dest, md);
    const missing = missingVariants(md);
    if (missing.length) {
      logErr(`✗ SCHEMA.md gerado mas faltam variantes: ${missing.join(", ")}`);
      process.exit(1);
    }
    logErr(`✓ SCHEMA.md gerado em ${dest} (todas as variantes presentes).`);
  });

program.parseAsync(process.argv);
