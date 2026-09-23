"""Gera os ícones do app do cuidador a partir do símbolo vetorial da IrisFlow
(site/public/favicon.svg). Renderiza com Chromium (Playwright) e confere com PIL.

Uso (da raiz do monorepo):
    pip install playwright pillow && python -m playwright install chromium
    python app/scripts/gerar-icones.py

Saídas em app/assets/images/ (as dimensões e o canal alfa são conferidos no fim):
    icon.png                      1024×1024 RGB, sem alfa (App Store recusa alfa)
    adaptive-icon.png             1024×1024 RGBA, símbolo dentro da zona segura (raio ≤ 313 px)
    adaptive-icon-monochrome.png  idem, branco puro (ícones temáticos do Android 13+)
    splash-icon.png               1024×1024 RGBA (o plugin expo-splash-screen reduz para 160 dp)
    notification-icon.png         96×96 RGBA, branco puro (o Android pinta com a cor do app.json)
    favicon.png                   48×48 (expo start --web)
"""
import re, io
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'app/assets/images'
svg = (ROOT / 'site/public/favicon.svg').read_text()
paths = re.findall(r'<path[^>]*d="([^"]+)"', svg)
swirl, pupil = paths[0], paths[1]

NAVY = '#091B33'
NAVY_SOFT = '#12284A'
SWIRL = '#3D74C8'   # brand.blueSoft: mais legível que #2f66c2 sobre o marinho em tamanho de ícone

def symbol_svg(size, scale, swirl_fill, pupil_fill, bg=None):
    """Símbolo (viewBox 512) centrado, ocupando `scale` da largura."""
    s = size * scale / 512
    off = (size - 512 * s) / 2
    bgsvg = ''
    if bg == 'gradient':
        bgsvg = (f'<defs><radialGradient id="g" cx="50%" cy="38%" r="75%">'
                 f'<stop offset="0" stop-color="{NAVY_SOFT}"/><stop offset="1" stop-color="{NAVY}"/></radialGradient></defs>'
                 f'<rect width="{size}" height="{size}" fill="url(#g)"/>')
    elif bg:
        bgsvg = f'<rect width="{size}" height="{size}" fill="{bg}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">{bgsvg}'
            f'<g transform="translate({off} {off}) scale({s})">'
            f'<path fill="{swirl_fill}" fill-rule="evenodd" d="{swirl}"/>'
            f'<path fill="{pupil_fill}" fill-rule="evenodd" d="{pupil}"/></g></svg>')

def render(page, svgtxt, size):
    page.set_viewport_size({'width': size, 'height': size})
    page.set_content(f'<html><body style="margin:0;background:transparent">{svgtxt}</body></html>')
    png = page.screenshot(omit_background=True, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
    return Image.open(io.BytesIO(png)).convert('RGBA')

jobs = {
    # iOS/App Store: 1024, SEM canal alfa, fundo cheio (o sistema aplica a máscara).
    'icon.png': (1024, symbol_svg(1024, 0.64, SWIRL, '#FFFFFF', bg='gradient'), 'RGB'),
    # Android adaptativo: primeiro plano transparente, símbolo dentro da zona segura
    # (círculo de 66/108 = 61 % → 626 px); 560 px deixa folga para qualquer máscara.
    'adaptive-icon.png': (1024, symbol_svg(1024, 0.547, SWIRL, '#FFFFFF'), 'RGBA'),
    # Android 13+ "ícones temáticos": só a silhueta conta (alfa), cor única.
    'adaptive-icon-monochrome.png': (1024, symbol_svg(1024, 0.547, '#FFFFFF', '#FFFFFF'), 'RGBA'),
    # Splash: o plugin expo-splash-screen redimensiona para `imageWidth`; transparente.
    'splash-icon.png': (1024, symbol_svg(1024, 1.0, SWIRL, '#FFFFFF'), 'RGBA'),
    # Ícone da notificação (Android): branco monocromático sobre transparente, 96×96.
    'notification-icon.png': (96, symbol_svg(96, 0.84, '#FFFFFF', '#FFFFFF'), 'RGBA'),
    # Web (expo start --web): 48 px.
    'favicon.png': (48, symbol_svg(48, 0.9, SWIRL, '#FFFFFF', bg=NAVY), 'RGBA'),
}

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(device_scale_factor=1)
    for name, (size, s, mode) in jobs.items():
        im = render(page, s, size)
        if mode == 'RGB':
            im = im.convert('RGB')
        im.save(OUT / name, optimize=True)
    b.close()

for name in jobs:
    im = Image.open(OUT / name)
    extra = ''
    if im.mode == 'RGBA':
        a = im.getchannel('A')
        bbox = a.getbbox()
        extra = f'alpha bbox={bbox}'
        rgb = {c[:3] for c in im.convert('RGBA').get_flattened_data() if c[3] > 0} if hasattr(im, 'get_flattened_data') else {c[:3] for c in im.getdata() if c[3] > 0}
        if name in ('notification-icon.png', 'adaptive-icon-monochrome.png'):
            extra += f' white-only={all(c == (255,255,255) for c in rgb)}'
    print(name, im.size, im.mode, (OUT / name).stat().st_size, 'bytes', extra)

# Conferências que as lojas fazem (falha alto em vez de gerar um ícone recusável).
assert Image.open(OUT / 'icon.png').mode == 'RGB' and Image.open(OUT / 'icon.png').size == (1024, 1024)
assert Image.open(OUT / 'notification-icon.png').size == (96, 96)
fg = Image.open(OUT / 'adaptive-icon.png').getchannel('A')
w, h = fg.size
px = fg.load()
raio = max(((x - w / 2) ** 2 + (y - h / 2) ** 2) ** 0.5 for y in range(0, h, 4) for x in range(0, w, 4) if px[x, y] > 16)
assert raio <= 66 / 108 * w / 2, f'símbolo fora da zona segura do ícone adaptativo: raio {raio:.0f}px'
print(f'zona segura ok: raio máximo {raio:.0f}px (limite {66 / 108 * w / 2:.0f}px)')
