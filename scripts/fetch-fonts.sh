#!/usr/bin/env bash
#
# Baixa as fontes estáticas .ttf usadas pelos templates (Satori aceita
# ttf/otf/woff, nunca woff2). Usa a API css2 do Google Fonts com um
# User-Agent antigo, que força o retorno de arquivos TrueType.
#
# Fontes: Sora (600, 700) e Inter (400, 600).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FONTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/fonts"
mkdir -p "$FONTS_DIR"

UA="Mozilla/4.0"
BASE="https://fonts.googleapis.com/css2"

# família:peso -> nome do arquivo de saída
download() {
  local family="$1" weight="$2" outfile="$3"
  local css url
  css="$(curl -fsS -A "$UA" "${BASE}?family=${family}:wght@${weight}")"
  # pega a primeira URL .ttf (bloco latin)
  url="$(printf '%s' "$css" | grep -o 'https[^)]*\.ttf' | head -n1)"
  if [ -z "$url" ]; then
    echo "ERRO: não achei URL .ttf para ${family} ${weight}" >&2
    exit 1
  fi
  curl -fsSL "$url" -o "${FONTS_DIR}/${outfile}"
  echo "ok  ${outfile}  <-  ${url}"
}

download "Sora"  600 "Sora-600.ttf"
download "Sora"  700 "Sora-700.ttf"
download "Inter" 400 "Inter-400.ttf"
download "Inter" 600 "Inter-600.ttf"

echo "Fontes baixadas em ${FONTS_DIR}"
