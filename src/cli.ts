#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { parsePost } from "./schema.js";
import { loadBrand } from "./tokens.js";
import { loadFonts, renderPost, listPosts } from "./render.js";
import { buildContactSheet, collectSlidePngs } from "./contact-sheet.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const POSTS_DIR = join(REPO_ROOT, "posts");

const program = new Command();
program.name("ig-render").description("Renderizador de criativos de Instagram a partir de JSON").version("0.1.0");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
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
      console.log(`✓ ${post.slug} válido — template ${post.template}, ${post.slides.length} slide(s).`);
      for (const w of warnings) console.warn(`  ⚠ ${w}`);
      process.exit(0);
    } catch (err) {
      console.error(`✗ ${(err as Error).message}`);
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
    if (options.all) {
      targets = listPosts(POSTS_DIR);
    } else if (files.length) {
      targets = files.map((f) => resolve(process.cwd(), f));
    } else {
      console.error("✗ informe arquivos ou use --all");
      process.exit(1);
    }
    if (!targets.length) {
      console.error("✗ nenhum post encontrado");
      process.exit(1);
    }

    const outRoot = options.debug ? join(resolve(process.cwd(), options.out), "debug") : resolve(process.cwd(), options.out);

    let totalSlides = 0;
    let totalMs = 0;
    const allTimings: number[] = [];

    for (const target of targets) {
      if (!existsSync(target)) {
        console.error(`✗ arquivo não encontrado: ${target}`);
        process.exit(1);
      }
      const { post, warnings } = parsePost(readJson(target));
      if (post.brand !== options.brand) {
        console.warn(`  ⚠ ${post.slug}: brand do JSON "${post.brand}" difere de --brand "${options.brand}"`);
      }
      for (const w of warnings) console.warn(`  ⚠ ${post.slug}: ${w}`);

      const { outDir, timings, manifest } = await renderPost(post, tokens, fonts, outRoot, {
        debug: options.debug,
        postDir: dirname(target),
      });
      totalSlides += manifest.files.length;
      const sum = timings.reduce((a, b) => a + b, 0);
      totalMs += sum;
      allTimings.push(...timings);
      console.log(`✓ ${post.slug} — ${manifest.files.length} slide(s) em ${outDir}  (${Math.round(sum)}ms)`);
    }

    const avg = allTimings.length ? totalMs / allTimings.length : 0;
    console.log(`\n${totalSlides} slide(s) renderizados. Tempo médio: ${avg.toFixed(1)}ms/slide.`);
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
    console.log(`✓ contact sheet: ${dest} (${width}x${height}, ${count} slides)`);
  });

program.parseAsync(process.argv);
