import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const THUMB_W = 270;
const THUMB_H = 338;
const GAP = 14;
const COLS = 5;
const PAD = 24;

/** Coleta todos os PNGs de slides em out/<slug>/ (ordenados, ignora debug/). */
export function collectSlidePngs(outRoot: string): string[] {
  if (!existsSync(outRoot)) return [];
  const pngs: string[] = [];
  for (const entry of readdirSync(outRoot).sort()) {
    const dir = join(outRoot, entry);
    if (entry === "debug") continue;
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).sort()) {
      if (f.endsWith(".png")) pngs.push(join(dir, f));
    }
  }
  return pngs;
}

/** Monta uma grade com todos os slides reduzidos, para inspeção visual única. */
export async function buildContactSheet(pngs: string[], outPath: string): Promise<{ width: number; height: number; count: number }> {
  if (!pngs.length) throw new Error("nenhum PNG encontrado para a contact sheet");

  const rows = Math.ceil(pngs.length / COLS);
  const width = PAD * 2 + COLS * THUMB_W + (COLS - 1) * GAP;
  const height = PAD * 2 + rows * THUMB_H + (rows - 1) * GAP;

  const thumbs = await Promise.all(
    pngs.map(async (p) => sharp(p).resize(THUMB_W, THUMB_H, { fit: "fill" }).png().toBuffer())
  );

  const composites = thumbs.map((buf, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return {
      input: buf,
      left: PAD + col * (THUMB_W + GAP),
      top: PAD + row * (THUMB_H + GAP),
    };
  });

  await sharp({
    create: { width, height, channels: 3, background: { r: 243, g: 244, b: 246 } },
  })
    .composite(composites)
    .png()
    .toFile(outPath);

  return { width, height, count: pngs.length };
}

/** Lê dimensões e tamanho de um PNG (para a verificação). */
export async function inspectPng(path: string): Promise<{ width: number; height: number; bytes: number }> {
  const meta = await sharp(path).metadata();
  const bytes = statSync(path).size;
  return { width: meta.width ?? 0, height: meta.height ?? 0, bytes };
}
