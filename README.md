<div align="center">

# meiUM

**Interactive study notes for the MSc in Informatics Engineering (MEI) at the University of Minho.**

[**meium.space**](https://meium.space/index.html) · Academic year 2026/2027

</div>

---

meiUM turns course slides into structured, self-contained study notes: concise explanations, the intuition behind each method, formulas, worked examples, interactive visualisations and review quizzes. It is built to be read and studied — on a laptop before an exam or on a phone on the bus.

The site is fully static: plain HTML, CSS and JavaScript, no build step, no framework, no backend.

## Courses

| Course | Topics |
| --- | --- |
| **DAA** — Dados e Aprendizagem Automática *(Data and Machine Learning)* | Data science concepts · Quality metrics and model validation · Data exploration and preparation · Linear and logistic regression · Feature engineering · Decision tree pruning and hyperparameter tuning · Ensemble learning |
| **ASCN** — Aplicações e Serviços de Computação em Nuvem *(Cloud Computing Applications and Services)* | DevOps and infrastructure as code · Distributed applications · System provisioning (Ansible) · Cloud computing (IaaS, PaaS, SaaS, OpenStack) · Virtualisation (VMs) |
| **ESR** — Engenharia de Serviços em Rede *(Network Services Engineering)* | Application layer principles · P2P and BitTorrent · Multimedia, video streaming (DASH) and CDNs · Socket programming · IP multicast (IGMP, PIM) |

More courses are added as the master's progresses.

## Features

- **Global search** — <kbd>Ctrl</kbd>+<kbd>K</kbd> or <kbd>/</kbd> searches titles, sections and text across every course (accent-insensitive) and jumps straight to the matching section. The index is built in the browser from the published pages, so it never goes stale and needs no build step.
- **Works offline** — a service worker stores the whole site on first visit, so every topic, formula and the search keep working without a connection. It can be installed as an app (PWA) on desktop and mobile.
- **Shareable links** — every page has Open Graph and Twitter Card tags with a preview image, a canonical URL on meium.space, and is listed in `sitemap.xml`. Unknown addresses get a friendly 404 page with search and links to every course.
- **Self-contained notes** — each topic stands on its own, with examples that can be worked through by hand and code that runs on datasets bundled with scikit-learn, so readers do not need the original slides.
- **Interactive widgets** — more than 20 SVG-based visualisations: confusion matrices, ROC curves, the LASSO path, decision-tree pruning, k-fold cross-validation, bootstrap sampling, distributed architectures with simulated node failures, Ansible idempotency, VM overcommit, and more.
- **Review built in** — every topic ends with a cheat sheet, common pitfalls, multiple-choice questions with explanations and worked exercises.
- **Clear sourcing** — material that goes beyond what was taught in class is tagged as *supplementary*, and can be hidden with one toggle.
- **Formulas** rendered with KaTeX; **code** with syntax highlighting and a copy button.
- **Reader settings** — light/dark theme, interface in Portuguese or English, adjustable text size; preferences are stored locally in the browser.
- **Responsive** — a sidebar on desktop, a drawer and top bar on mobile.
- **Keyboard navigation** between sections with <kbd>←</kbd> <kbd>→</kbd>.

## Tech stack

| Layer | Choice |
| --- | --- |
| Pages | Static HTML, one file per topic; each `<article class="page">` is a section routed by URL hash |
| Styling | A single CSS file with design tokens, light/dark themes and a per-course accent colour |
| Behaviour | Vanilla JavaScript (no dependencies) |
| Maths | [KaTeX](https://katex.org/), self-hosted |
| Fonts | Archivo, Source Serif 4 and JetBrains Mono, self-hosted as WOFF2 (SIL Open Font License) |
| Offline | Service worker (`sw.js`) and web app manifest; no third-party requests at runtime |
| Hosting | [Vercel](https://vercel.com/), deployed on every push to `main` |

## Project structure

```
index.html                 Home page (course list, generated from the catalogue)
404.html                   Not-found page (served by Vercel for any unknown path)
daa/                       Data and Machine Learning
  index.html               Course page (topic list)
  01-…html … 07-…html      One file per topic
ascn/                      Cloud Computing Applications and Services
esr/                       Network Services Engineering
assets/
  css/style.css            Styles, themes and components
  css/fonts.css            @font-face rules for the self-hosted fonts
  fonts/                   WOFF2 font files and their licences
  vendor/katex/            KaTeX (JS, CSS, fonts)
  js/catalog.js            Course and topic registry — the single source of navigation
  js/app.js                Navigation, routing, pagination, quizzes, code blocks, settings
  js/i18n.js               Interface strings in Portuguese and English
  js/widgets.js            Reusable interactive widgets
  img/                     Favicon, app icons and the link-preview image (og.png)
templates/topic.html       Starter file showing every available component
tools/seo.py               Generates sharing meta tags and sitemap.xml
sitemap.xml, robots.txt    For search engines
sw.js                      Service worker (offline cache)
manifest.webmanifest       App manifest (installable PWA)
vercel.json
```

## Running locally

Open `index.html` directly in a browser, or serve the folder:

```bash
python -m http.server 5173
```

Then visit <http://localhost:5173>.

## Adding content

**A new topic in an existing course**

1. Copy `templates/topic.html` to `<course>/NN-slug.html`.
2. Set `data-uc` and `data-topic` on the `<body>` element.
3. Register the topic in `assets/js/catalog.js` with `status: 'ready'` (the `file` field must match the file name).
4. Run `python tools/seo.py` to add the sharing tags (Open Graph, canonical URL) to the new page and refresh `sitemap.xml`.

The sidebar, pagination, topic map and links between topics are generated automatically.

**A new course**

1. Create a `<course-id>/` folder with an `index.html` (copy `daa/index.html` and change `data-uc`).
2. Add the course to `catalog.js`, including a `hue` (0–360) for its accent colour and English names (`en`, `desc_en`).

### Components

| Component | Markup |
| --- | --- |
| Formula | `\( … \)` inline; `<div class="formula">\[ … \]</div>` as a block |
| Notes | `.note` (intuition), `.note.warn` (pitfall), `.note.extra` (supplementary) |
| Supplementary tag | `<span class="xtag">complemento</span>` |
| Code | `<pre><code class="language-python">…</code></pre>` — also `bash`, `yaml`, `text` |
| Collapsible | `<details class="ans"><summary>…</summary><div>…</div></details>` |
| Quiz | `.quiz` with `.opts > button[data-ok]` and `.why`; group in `[data-quizset]` for scoring |
| Classification exercise | `.classify[data-options]` with `.ci[data-answer][data-why]` |
| Widget | `<div class="widget" data-widget="name">` — see `assets/js/widgets.js` for the full list |
| Data-driven widget | `heatmap` and `lines` read a `<script type="application/json">` inside the element |

## Deployment

The repository is connected to Vercel with the **Other** preset (no build command, output directory = repository root). Every push to `main` is deployed to [meium.space](https://meium.space/index.html).

## Disclaimer

These are personal study notes written by a student. They are based on the course materials of the University of Minho but are not official course material, and they may contain mistakes. When in doubt, the lectures and the teaching staff are the reference.

Content is written in Portuguese; the interface is available in Portuguese and English.

## Author

Maintained by [@neptunedev77](https://github.com/neptunedev77). Suggestions and corrections are welcome — open an issue.
