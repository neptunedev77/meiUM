# meiUM

Apontamentos interativos do Mestrado em Engenharia Informática (Universidade do Minho).
Site estático (HTML + CSS + JS, sem build), pronto para GitHub e Vercel.

## Estrutura

```
index.html                     página inicial (lista de UCs, gerada a partir do catálogo)
daa/
  index.html                   página da UC (lista de temas)
  01-data-science-concepts.html   um tema = um ficheiro; cada <article class="page"> é uma sub-página (#hash)
assets/
  css/style.css                estilos (tema claro/escuro, layout, componentes)
  js/catalog.js                ← registo de UCs e temas: a única fonte da navegação
  js/app.js                    navegação, paginação, quizzes, blocos de código, definições
  js/i18n.js                   textos da interface em PT e EN (o conteúdo dos temas não passa por aqui)
  js/widgets.js                exemplos interativos reutilizáveis (gráficos SVG)
  img/favicon.svg
templates/topic.html           modelo com todos os componentes
vercel.json
```

## Acrescentar conteúdo

**Novo tema numa UC existente**
1. Copiar `templates/topic.html` para `daa/NN-slug.html`.
2. Ajustar `data-uc` e `data-topic` no `<body>`.
3. Em `assets/js/catalog.js`, pôr o tema com `status: 'ready'` (o nome do ficheiro tem de coincidir com `file`).

A barra lateral, a paginação, o "mapa do tema" e as ligações entre temas são gerados automaticamente.

**Nova UC**
1. Criar a pasta `<id>/` com um `index.html` (copiar `daa/index.html` e mudar `data-uc`).
2. Acrescentar a UC em `catalog.js`, com um `hue` (0–360) para a cor de destaque.

## Componentes

| Componente | Markup |
| --- | --- |
| Fórmula | `\( … \)` inline, `<div class="formula">\[ … \]</div>` em bloco (KaTeX) |
| Notas | `.note` (intuição), `.note.warn` (armadilha), `.note.extra` (complemento fora dos slides) |
| Complemento inline | `<span class="xtag">complemento</span>` |
| Código | `<pre><code class="language-python">…</code></pre>` (também `language-bash`) |
| Expansível | `<details class="ans"><summary>…</summary><div>…</div></details>` |
| Quiz | `.quiz` com `.opts > button[data-ok]` e `.why`; agrupar em `[data-quizset]` para pontuação |
| Classificar | `.classify[data-options]` com `.ci[data-answer][data-why]` |
| Widgets | `<div class="widget" data-widget="…">` — `stats`, `normal`, `pmf`, `boxplot`, `correlation`, `confusion`, `roc`, `fscore`, `regerr`, `kfold`, `scale`, `shape`, `linfit`, `sigmoid`, `encoding`, `voting`, `bootstrap` |
| Widgets com dados | `heatmap` e `lines` leem um `<script type="application/json">` dentro do div (ver `daa/06-decision-trees.html`) |
| Pipeline de ML | `<ol class="pipeline"><li>…</li><li class="on">…</li></ol>` |

Convenção: o conteúdo segue os slides; tudo o que não vem dos slides é marcado como **complemento**.

## Ver localmente

Abrir `index.html` diretamente no browser funciona. Para um servidor local:

```bash
python -m http.server 5173
```

## Publicar no Vercel

Importar o repositório no Vercel com o preset **Other** (sem build command, output = raiz). Cada `git push` para `main` publica automaticamente.
