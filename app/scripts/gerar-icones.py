"""Gera os ícones, a abertura e a imagem de loja do IrisFlow Cuidador.

Fontes (versionadas):
    site/public/brand/irisflow-simbolo.svg            símbolo vetorial da IrisFlow
    site/public/brand/irisflow-cuidador-negativo.svg  a marca do app (símbolo + "cuidador"),
                                                      gerada por app/scripts/gerar-marca-cuidador.py

Renderiza com Chromium (Playwright) e confere com PIL.

Uso (da raiz do monorepo):
    pip install playwright pillow && python -m playwright install chromium
    python app/scripts/gerar-icones.py

Saídas (as dimensões e o canal alfa são conferidos no fim):
    app/assets/images/icon.png                      1024×1024 RGB, sem alfa (App Store recusa alfa)
    app/assets/images/adaptive-icon.png             1024×1024 RGBA, símbolo dentro da zona segura (raio ≤ 313 px)
    app/assets/images/adaptive-icon-monochrome.png  idem, branco puro (ícones temáticos do Android 13+)
    app/assets/images/splash-icon.png               a capa: marca do app, 1024 px de largura, fundo transparente
                                                    (o expo-splash-screen desenha em `imageWidth` sobre o marinho)
    app/assets/images/notification-icon.png         96×96 RGBA, branco puro (o Android pinta com a cor do app.json)
    app/assets/images/favicon.png                   48×48 (expo start --web)
    app/assets/store/imagem-de-destaque.png         1024×500 RGB, a imagem de destaque do Google Play
"""
import io
import re
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'app/assets/images'
LOJA = ROOT / 'app/assets/store'
simbolo = (ROOT / 'site/public/brand/irisflow-simbolo.svg').read_text(encoding='utf-8')
marca_negativa = (ROOT / 'site/public/brand/irisflow-cuidador-negativo.svg').read_text(encoding='utf-8')

VB = [float(v) for v in re.search(r'viewBox="([^"]+)"', simbolo).group(1).split()]
PATHS = re.findall(r'<path class="(\w+)" fill="#[0-9A-Fa-f]{6}" d="([^"]+)"', simbolo)
MARCA_VB = [float(v) for v in re.search(r'viewBox="([^"]+)"', marca_negativa).group(1).split()]

NAVY = '#091B33'
NAVY_SOFT = '#12284A'
AZUL_ICONE = '#3D74C8'   # brand.blueSoft: mais legível que o #1B54A8 sobre o marinho em tamanho de ícone


def fundo(largura, altura, bg):
    if bg == 'gradiente':
        return (f'<defs><radialGradient id="g" cx="50%" cy="38%" r="75%">'
                f'<stop offset="0" stop-color="{NAVY_SOFT}"/><stop offset="1" stop-color="{NAVY}"/></radialGradient></defs>'
                f'<rect width="{largura}" height="{altura}" fill="url(#g)"/>')
    if bg:
        return f'<rect width="{largura}" height="{altura}" fill="{bg}"/>'
    return ''


def simbolo_svg(size, scale, lamina, pupila, bg=None):
    """Símbolo centrado num quadrado `size`, ocupando `scale` do lado."""
    vx, vy, vw, vh = VB
    s = size * scale / max(vw, vh)
    ox = (size - vw * s) / 2 - vx * s
    oy = (size - vh * s) / 2 - vy * s
    corpo = ''.join(f'<path fill="{pupila if c == "pupila" else lamina}" d="{d}"/>' for c, d in PATHS)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
            f'{fundo(size, size, bg)}<g transform="translate({ox:.3f} {oy:.3f}) scale({s:.5f})">{corpo}</g></svg>')


def marca_svg(largura, altura, largura_da_marca, bg=None, lamina=AZUL_ICONE):
    """A marca negativa (símbolo + "cuidador") centrada num retângulo.

    As lâminas saem no azul dos ícones (e não no #1B54A8 do arquivo da marca) para a
    capa continuar o ícone que a pessoa acabou de tocar."""
    _, _, mw, mh = MARCA_VB
    s = largura_da_marca / mw
    ox = (largura - mw * s) / 2
    oy = (altura - mh * s) / 2
    interior = re.sub(r'^.*?<svg[^>]*>|</svg>\s*$', '', marca_negativa, flags=re.S)
    interior = interior.replace('fill="#1B54A8"', f'fill="{lamina}"')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{largura}" height="{altura}" viewBox="0 0 {largura} {altura}">'
            f'{fundo(largura, altura, bg)}<g transform="translate({ox:.3f} {oy:.3f}) scale({s:.5f})">{interior}</g></svg>')


def render(page, svgtxt, largura, altura):
    page.set_viewport_size({'width': largura, 'height': altura})
    page.set_content(f'<html><body style="margin:0;background:transparent">{svgtxt}</body></html>')
    png = page.screenshot(omit_background=True, clip={'x': 0, 'y': 0, 'width': largura, 'height': altura})
    return Image.open(io.BytesIO(png)).convert('RGBA')


_, _, MW, MH = MARCA_VB
ALTURA_CAPA = round(1024 * MH / MW)

jobs = {
    # iOS/App Store: 1024, SEM canal alfa, fundo cheio (o sistema aplica a máscara).
    OUT / 'icon.png': (1024, 1024, simbolo_svg(1024, 0.64, AZUL_ICONE, '#FFFFFF', bg='gradiente'), 'RGB'),
    # Android adaptativo: primeiro plano transparente, símbolo dentro da zona segura
    # (círculo de 66/108 = 61 % → 626 px); 560 px deixa folga para qualquer máscara.
    OUT / 'adaptive-icon.png': (1024, 1024, simbolo_svg(1024, 0.547, AZUL_ICONE, '#FFFFFF'), 'RGBA'),
    # Android 13+ "ícones temáticos": só a silhueta conta (alfa), cor única.
    OUT / 'adaptive-icon-monochrome.png': (1024, 1024, simbolo_svg(1024, 0.547, '#FFFFFF', '#FFFFFF'), 'RGBA'),
    # Capa (abertura): a marca do app, transparente; o fundo marinho vem do app.json.
    OUT / 'splash-icon.png': (1024, ALTURA_CAPA, marca_svg(1024, ALTURA_CAPA, 1024), 'RGBA'),
    # Ícone da notificação (Android): branco monocromático sobre transparente, 96×96.
    OUT / 'notification-icon.png': (96, 96, simbolo_svg(96, 0.84, '#FFFFFF', '#FFFFFF'), 'RGBA'),
    # Web (expo start --web): 48 px.
    OUT / 'favicon.png': (48, 48, simbolo_svg(48, 0.9, AZUL_ICONE, '#FFFFFF', bg=NAVY), 'RGBA'),
    # Google Play: imagem de destaque, 1024×500, sem alfa.
    LOJA / 'imagem-de-destaque.png': (1024, 500, marca_svg(1024, 500, 250, bg='gradiente'), 'RGB'),
}

LOJA.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(device_scale_factor=1)
    for destino, (w, h, s, modo) in jobs.items():
        im = render(page, s, w, h)
        if modo == 'RGB':
            im = im.convert('RGB')
        im.save(destino, optimize=True)
    b.close()

for destino in jobs:
    im = Image.open(destino)
    extra = ''
    if im.mode == 'RGBA':
        a = im.getchannel('A')
        extra = f'alpha bbox={a.getbbox()}'
        cores = {c[:3] for c in im.convert('RGBA').get_flattened_data() if c[3] > 0}
        if destino.name in ('notification-icon.png', 'adaptive-icon-monochrome.png'):
            extra += f' white-only={all(c == (255, 255, 255) for c in cores)}'
    print(destino.relative_to(ROOT), im.size, im.mode, destino.stat().st_size, 'bytes', extra)

# Conferências que as lojas fazem (falha alto em vez de gerar um ícone recusável).
assert Image.open(OUT / 'icon.png').mode == 'RGB' and Image.open(OUT / 'icon.png').size == (1024, 1024)
assert Image.open(OUT / 'notification-icon.png').size == (96, 96)
assert Image.open(LOJA / 'imagem-de-destaque.png').size == (1024, 500)
fg = Image.open(OUT / 'adaptive-icon.png').getchannel('A')
w, h = fg.size
px = fg.load()
raio = max(((x - w / 2) ** 2 + (y - h / 2) ** 2) ** 0.5 for y in range(0, h, 4) for x in range(0, w, 4) if px[x, y] > 16)
assert raio <= 66 / 108 * w / 2, f'símbolo fora da zona segura do ícone adaptativo: raio {raio:.0f}px'
print(f'zona segura ok: raio máximo {raio:.0f}px (limite {66 / 108 * w / 2:.0f}px)')
