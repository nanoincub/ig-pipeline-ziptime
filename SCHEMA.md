# Post JSON — schema

Referência para escrever um Post JSON válido para o ig-pipeline.
Gerado de `src/schema.ts` por `ig-render schema`. Não editar à mão.

## Post

| campo | tipo | obrigatoriedade | descrição |
|---|---|---|---|
| `slug` | string | obrigatório | kebab-case; nome base dos arquivos de saída |
| `brand` | string | obrigatório | slug da marca (brands/<brand>.json) |
| `template` | quote-card \| carousel-edu \| carousel-list | obrigatório | qual template renderiza o post |
| `size` | 1080x1350 \| 1080x1080 \| 1080x1920 | default 1080x1350 | dimensão do criativo |
| `theme` | light \| light-blue \| gradient-hero \| gradient-zipagent \| solid-blue \| yellow | default light | fundo do post (cor ou gradiente) |
| `accent` | primary \| zipagent \| zipzap \| cyan \| red \| purple | default primary | cor de destaque de kicker, números e blocos |
| `signature.enabled` | boolean | default true | mostra a assinatura da marca |
| `signature.onlyLastSlide` | boolean | default true | assinatura só no último slide |
| `slides` | Slide[] | obrigatório, min 1 | lista de slides na ordem de exibição |

## Slide

| campo | tipo | obrigatoriedade | descrição |
|---|---|---|---|
| `role` | cover \| body \| close | obrigatório | papel do slide no carrossel |
| `variant` | string | obrigatório | layout; ver variantes válidas por template/role |
| `kicker` | string | opcional | rótulo pequeno em uppercase acima do título |
| `title` | string | opcional | título do slide |
| `body` | string | opcional | parágrafos separados por \n\n (itens por \n em summary-list) |
| `highlight` | string | opcional | frase ou número em destaque |
| `number` | number | opcional | ordem em listas (number-*) |
| `source` | string | opcional | fonte do dado, exibida como rodapé |
| `cta` | string | opcional | chamada para ação no slide de fechamento |
| `background` | { type:"image", src:string, overlay?:0..1 } | opcional | imagem de fundo com overlay escuro opcional |

## Variantes válidas por template e role

A `variant` de cada slide precisa estar na lista do seu `template` + `role`.

### quote-card
- **slide único:** `centered-light`, `left-ink-on-blue`, `big-quote-marks`, `split-color-block`

### carousel-edu
- **cover:** `title-big-left`, `title-center-blue-bg`, `title-with-number`
- **body:** `text-only`, `text-with-highlight`, `text-with-bar`, `quote`, `big-number`
- **close:** `cta-simple`, `cta-save`, `summary-list`

### carousel-list
- **cover:** `list-title-left`, `list-title-stack`
- **body:** `number-huge`, `number-badge`, `number-side`
- **close:** `cta-simple`, `cta-save`

## Regras

- `body` com mais de 60 palavras gera **aviso** (não bloqueia o render).
- Título de capa encolhe por nº de caracteres: ≤40 → 96px, ≤70 → 84px, senão 72px.
- `summary-list` (carousel-edu/close) usa `body` como itens separados por quebra de linha.
- Temas `gradient-*` e `solid-blue` usam texto branco e a versão do símbolo para fundo escuro; `light`/`light-blue`/`yellow` usam texto escuro e o símbolo azul.
- `yellow` (fundo `colors.yellow`) e `solid-blue` (fundo `colors.primary`) são **só temas de fundo**. O amarelo nunca vira cor de texto nem de accent.
- Accents `cyan`, `red` e `purple` vêm de `colors.{cyan,red,purple}` da marca. `cyan` e `red` só são aplicados a elementos grandes (números, barras, ícones, tags e títulos ≥ 56px); em kicker, CTA e texto de corpo o template cai para `ink` (tema claro) ou branco (tema escuro).
- Se a marca não define a cor exigida pelo `theme`/`accent` escolhido, o `validate` **falha** com mensagem clara (sem fallback silencioso).
- Carrosséis mostram contador `n/total` em todos os slides menos a capa.

## Saída

- Render local: `out/<slug>/<slug>-<nn>.png` (nn com dois dígitos) + `out/<slug>/manifest.json`.
- Upload: cada PNG sobe como `<slug>-<nn>-<hash8>.png`, onde `hash8` são os 8
  primeiros caracteres do SHA256 do arquivo. Conteúdo idêntico mantém a mesma
  chave; qualquer mudança gera uma chave nova. Isso contorna o cache imutável do
  Worker (`max-age=31536000, immutable`): re-renderizar um post com o mesmo slug
  produz URLs novas só para os slides que mudaram. Versões antigas não são
  removidas do bucket.
- As URLs com hash (uma por slide) ficam em `manifest.urls[]` e são o stdout de
  `ig-render upload` e `ig-render pipeline`.

## Exemplos completos

### posts/frase-crm-que-o-time-usa.json
```json
{
  "slug": "frase-crm-que-o-time-usa",
  "brand": "ziptime",
  "template": "quote-card",
  "size": "1080x1350",
  "theme": "gradient-hero",
  "accent": "primary",
  "signature": { "enabled": true, "onlyLastSlide": false },
  "slides": [
    {
      "role": "cover",
      "variant": "left-ink-on-blue",
      "kicker": "CRM na prática",
      "highlight": "Seu time não usa o CRM porque você pediu para registrar coisa demais.",
      "source": "Ziptime"
    }
  ]
}
```

### posts/carrossel-follow-up-whatsapp.json
```json
{
  "slug": "carrossel-follow-up-whatsapp",
  "brand": "ziptime",
  "template": "carousel-edu",
  "size": "1080x1350",
  "theme": "light",
  "accent": "zipzap",
  "signature": { "enabled": true, "onlyLastSlide": true },
  "slides": [
    {
      "role": "cover",
      "variant": "title-big-left",
      "kicker": "Follow-up",
      "title": "Como cobrar resposta no WhatsApp sem parecer chato"
    },
    {
      "role": "body",
      "variant": "text-only",
      "kicker": "O erro comum",
      "title": "O problema não é insistir",
      "body": "O problema é mandar sempre a mesma mensagem: \"oi, tudo bem? conseguiu ver?\".\n\nQuando o follow-up não traz nada novo, o cliente aprende a ignorar."
    },
    {
      "role": "body",
      "variant": "text-with-highlight",
      "kicker": "A virada",
      "title": "Dê um motivo para a pessoa voltar",
      "highlight": "Todo follow-up precisa carregar uma informação útil.",
      "body": "Um caso parecido, um prazo que muda, uma dúvida específica. A conversa avança porque você trouxe algo, não porque pediu atenção."
    },
    {
      "role": "body",
      "variant": "text-with-bar",
      "kicker": "Ritmo",
      "title": "Espace os contatos",
      "body": "No mesmo dia, depois em dois dias, depois em uma semana.\n\nDar espaço mostra que você respeita o tempo do cliente e tira o tom de cobrança."
    },
    {
      "role": "body",
      "variant": "quote",
      "highlight": "Follow-up bom parece ajuda. Follow-up ruim parece dívida.",
      "source": "Ziptime"
    },
    {
      "role": "body",
      "variant": "big-number",
      "kicker": "Por que insistir",
      "highlight": "80%",
      "title": "das vendas acontecem depois do quinto contato",
      "body": "A maioria dos vendedores para no segundo. Quem organiza o follow-up fica com o que os outros deixaram na mesa."
    },
    {
      "role": "close",
      "variant": "summary-list",
      "kicker": "Resumo",
      "title": "O follow-up que funciona",
      "body": "Traga sempre uma informação nova para a conversa\nEspace os contatos: no mesmo dia, em dois dias, em uma semana\nPare de repetir \"conseguiu ver?\"\nInsista: a maioria das vendas vem depois do quinto contato",
      "cta": "Salvar este post"
    }
  ]
}
```

### posts/lista-5-indicadores-semanais.json
```json
{
  "slug": "lista-5-indicadores-semanais",
  "brand": "ziptime",
  "template": "carousel-list",
  "size": "1080x1350",
  "theme": "light",
  "accent": "primary",
  "signature": { "enabled": true, "onlyLastSlide": true },
  "slides": [
    {
      "role": "cover",
      "variant": "list-title-stack",
      "kicker": "Gestão comercial",
      "highlight": "5",
      "title": "indicadores para olhar toda semana no seu funil"
    },
    {
      "role": "body",
      "variant": "number-huge",
      "number": 1,
      "title": "Oportunidades criadas",
      "body": "Quantos negócios novos entraram no funil. É o combustível da semana: sem entrada, não há saída."
    },
    {
      "role": "body",
      "variant": "number-badge",
      "number": 2,
      "title": "Taxa de avanço por etapa",
      "body": "Quantos leads passam de uma etapa para a próxima. Mostra onde o funil trava e onde o discurso convence."
    },
    {
      "role": "body",
      "variant": "number-side",
      "number": 3,
      "title": "Follow-ups atrasados",
      "body": "Tarefas que venceram e ninguém tocou. Cada atraso aqui é um negócio esfriando em silêncio."
    },
    {
      "role": "body",
      "variant": "number-huge",
      "number": 4,
      "title": "Tempo médio em cada etapa",
      "body": "Quantos dias um lead fica parado em cada fase. Etapa lenta demais avisa que algo precisa de ajuste."
    },
    {
      "role": "body",
      "variant": "number-badge",
      "number": 5,
      "title": "Previsão de fechamento do mês",
      "body": "A soma do que tem chance real de fechar. Serve para agir na segunda, não para explicar no dia 30."
    },
    {
      "role": "close",
      "variant": "cta-simple",
      "kicker": "Comece agora",
      "title": "Abra seu funil e confira esses cinco pontos",
      "cta": "Siga para mais rotinas de gestão"
    }
  ]
}
```
