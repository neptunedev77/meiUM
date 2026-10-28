"""
Gera as meta tags de partilha (Open Graph, Twitter, canónico) de cada página
e o sitemap.xml. Correr na raiz do repositório depois de acrescentar um tema:

    python tools/seo.py

Usa o <title> e a <meta name="description"> que cada página já tem. O bloco gerado
fica entre os comentários "partilha" e é substituído a cada execução.
"""
import datetime, glob, html, os, re, subprocess

SITE = 'https://meium.space'
IMAGE = SITE + '/assets/img/og.png'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START, END = '<!-- partilha: gerado por tools/seo.py -->', '<!-- /partilha -->'


def pages():
    """Página inicial, páginas das UCs e temas (sem o template nem a 404)."""
    files = ['index.html'] + sorted(f.replace(os.sep, '/') for f in glob.glob('*/*.html', root_dir=ROOT))
    return [f for f in files if not f.startswith('templates/')]


def public_url(f):
    if f == 'index.html':
        return SITE + '/'
    if f.endswith('/index.html'):
        return f'{SITE}/{f[:-len("index.html")]}'
    return f'{SITE}/{f}'


def lastmod(f):
    """Data do último commit do ficheiro; hoje se tiver alterações por guardar."""
    git = lambda *a: subprocess.run(['git', *a, '--', f], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    try:
        if git('status', '--porcelain'):
            return datetime.date.today().isoformat()
        return git('log', '-1', '--format=%cs') or datetime.date.today().isoformat()
    except OSError:
        return datetime.date.today().isoformat()


def block(f, src):
    title = html.unescape(re.search(r'<title>(.*?)</title>', src, re.S).group(1).strip())
    desc = html.unescape(re.search(r'<meta name="description" content="(.*?)">', src, re.S).group(1))
    og_title = re.sub(r' · meiUM$', '', title)
    url = public_url(f)
    a = lambda s: html.escape(s, quote=True)
    kind = 'article' if re.search(r'data-view="topic"', src) else 'website'
    return '\n'.join([
        START,
        f'<link rel="canonical" href="{url}">',
        f'<meta property="og:type" content="{kind}">',
        '<meta property="og:site_name" content="meiUM">',
        '<meta property="og:locale" content="pt_PT">',
        f'<meta property="og:title" content="{a(og_title)}">',
        f'<meta property="og:description" content="{a(desc)}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{IMAGE}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="meiUM: apontamentos do Mestrado em Engenharia Informática da Universidade do Minho">',
        '<meta name="twitter:card" content="summary_large_image">',
        END,
    ])


def main():
    urls = []
    for f in pages():
        path = os.path.join(ROOT, f)
        with open(path, encoding='utf-8') as fh:
            src = fh.read()
        new = block(f, src)
        if START in src:
            src = re.sub(re.escape(START) + r'.*?' + re.escape(END), lambda _: new, src, flags=re.S)
        else:
            src = re.sub(r'(<meta name="description" content=".*?">\n)', lambda m: m.group(1) + new + '\n', src, count=1, flags=re.S)
        with open(path, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(src)
        urls.append((public_url(f), lastmod(f)))

    xml = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    xml += [f'  <url><loc>{u}</loc><lastmod>{d}</lastmod></url>' for u, d in urls]
    xml.append('</urlset>')
    with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(xml) + '\n')
    print(f'{len(urls)} páginas atualizadas; sitemap.xml com {len(urls)} URLs')


if __name__ == '__main__':
    main()
