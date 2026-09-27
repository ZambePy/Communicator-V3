"""Gera a marca do IrisFlow Cuidador: o símbolo da IrisFlow com "cuidador" embaixo.

Fontes (versionadas no repositório):
    site/public/brand/irisflow-simbolo.svg   símbolo vetorial, cores oficiais
    frontend/src/assets/fonts/Boldonse.ttf   a fonte do logotipo da IrisFlow (OFL)

Saídas:
    site/public/brand/irisflow-cuidador.svg            positivo (fundo claro)
    site/public/brand/irisflow-cuidador-negativo.svg   negativo (fundo escuro)
    app/src/components/marcaCuidador.ts                o símbolo e o "cuidador" em caminhos SVG,
                                                       para o app desenhar a marca sem carregar a fonte

O texto é convertido em contorno (HarfBuzz para o espaçamento, fontTools para as
curvas): o SVG final não depende da fonte instalada em lugar nenhum.

Uso (da raiz do monorepo):
    pip install fonttools uharfbuzz
    python app/scripts/gerar-marca-cuidador.py
Depois, para os ícones, a abertura e a imagem da loja:
    python app/scripts/gerar-icones.py
"""
import re
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
SIMBOLO = ROOT / 'site/public/brand/irisflow-simbolo.svg'
FONTE = ROOT / 'frontend/src/assets/fonts/Boldonse.ttf'
BRAND = ROOT / 'site/public/brand'
TS = ROOT / 'app/src/components/marcaCuidador.ts'

PALAVRA = 'cuidador'
AZUL = '#1B54A8'      # lâminas (oficial)
MARINHO = '#091B33'   # pupila e texto no positivo
BRANCO = '#FFFFFF'    # pupila e texto no negativo

# Proporções da assinatura vertical, em unidades da altura do símbolo (= 100).
ALTURA_SIMBOLO = 100.0
LARGURA_TEXTO = 1.42   # a palavra ocupa 1,42 × a largura do símbolo
VAO = 0.2              # espaço entre o símbolo e a palavra


def fmt(v: float) -> str:
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s == '-0' else s


def caminhos_do_simbolo():
    txt = SIMBOLO.read_text(encoding='utf-8')
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', txt).group(1).split()]
    paths = re.findall(r'<path class="(\w+)" fill="(#[0-9A-Fa-f]{6})" d="([^"]+)"', txt)
    assert len(paths) == 5, f'esperava 5 caminhos no símbolo, achei {len(paths)}'
    return vb, paths


def palavra_em_contorno():
    """Contorno da palavra em unidades da fonte, com a linha de base em y = 0 (y para baixo)."""
    fonte = TTFont(FONTE)
    glifos = fonte.getGlyphSet()
    ordem = fonte.getGlyphOrder()
    blob = hb.Blob.from_file_path(str(FONTE))
    face = hb.Face(blob)
    font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(PALAVRA)
    buf.guess_segment_properties()
    hb.shape(font, buf, {'kern': True, 'liga': True})
    pen = SVGPathPen(glifos)
    limites = BoundsPen(glifos)
    x = 0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        nome = ordem[info.codepoint]
        t = (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)
        glifos[nome].draw(TransformPen(pen, t))
        glifos[nome].draw(TransformPen(limites, t))
        x += pos.x_advance
    return pen.getCommands(), limites.bounds


def assinatura(pupila: str, texto: str) -> tuple[str, str]:
    vb, paths = caminhos_do_simbolo()
    sx, sy, sw, sh = vb
    k = ALTURA_SIMBOLO / sh
    largura_simbolo = sw * k

    d_palavra, (px0, py0, px1, py1) = palavra_em_contorno()
    kp = (largura_simbolo * LARGURA_TEXTO) / (px1 - px0)
    largura_palavra = (px1 - px0) * kp
    altura_palavra = (py1 - py0) * kp

    largura = max(largura_simbolo, largura_palavra)
    altura = ALTURA_SIMBOLO + VAO * ALTURA_SIMBOLO + altura_palavra
    ox_simbolo = (largura - largura_simbolo) / 2
    ox_palavra = (largura - largura_palavra) / 2
    oy_palavra = ALTURA_SIMBOLO * (1 + VAO)

    g_simbolo = (f'<g transform="translate({fmt(ox_simbolo)} 0) scale({k:.5f}) '
                 f'translate({fmt(-sx)} {fmt(-sy)})">')
    for classe, cor, d in paths:
        g_simbolo += f'<path fill="{pupila if classe == "pupila" else AZUL}" d="{d}"/>'
    g_simbolo += '</g>'
    g_palavra = (f'<g transform="translate({fmt(ox_palavra)} {fmt(oy_palavra)}) scale({kp:.6f}) '
                 f'translate({fmt(-px0)} {fmt(-py0)})"><path fill="{texto}" d="{d_palavra}"/></g>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(largura)} {fmt(altura)}" '
           f'role="img" aria-label="IrisFlow Cuidador">\n'
           f'  <!-- Gerado por app/scripts/gerar-marca-cuidador.py: símbolo da IrisFlow + "cuidador" em Boldonse. -->\n'
           f'  {g_simbolo}\n  {g_palavra}\n</svg>\n')
    return svg, d_palavra


def modulo_ts(d_palavra: str) -> str:
    vb, paths = caminhos_do_simbolo()
    _, (px0, py0, px1, py1) = palavra_em_contorno()
    laminas = [d for classe, _, d in paths if classe == 'lamina']
    pupila = next(d for classe, _, d in paths if classe == 'pupila')
    linhas = ',\n'.join(f"    '{d}'" for d in laminas)
    return f'''/**
 * Marca do IrisFlow Cuidador em caminhos SVG — GERADO por
 * app/scripts/gerar-marca-cuidador.py; não edite à mão.
 *
 * O símbolo vem de site/public/brand/irisflow-simbolo.svg e a palavra
 * "cuidador" é a fonte Boldonse (a do logotipo da IrisFlow) convertida em
 * contorno, para o app desenhar a marca com react-native-svg sem carregar a fonte.
 */

export const SIMBOLO = {{
  viewBox: '{' '.join(fmt(v) for v in vb)}',
  laminas: [
{linhas},
  ],
  pupila: '{pupila}',
}} as const;

export const PALAVRA_CUIDADOR = {{
  viewBox: '{fmt(px0)} {fmt(py0)} {fmt(px1 - px0)} {fmt(py1 - py0)}',
  d: '{d_palavra}',
}} as const;

/** Proporções da assinatura vertical (altura do símbolo = 1). */
export const PROPORCOES = {{ larguraDaPalavra: {LARGURA_TEXTO}, vao: {VAO} }} as const;
'''


if __name__ == '__main__':
    positivo, d = assinatura(MARINHO, MARINHO)
    negativo, _ = assinatura(BRANCO, BRANCO)
    (BRAND / 'irisflow-cuidador.svg').write_text(positivo, encoding='utf-8')
    (BRAND / 'irisflow-cuidador-negativo.svg').write_text(negativo, encoding='utf-8')
    TS.write_text(modulo_ts(d), encoding='utf-8')
    for f in ('irisflow-cuidador.svg', 'irisflow-cuidador-negativo.svg'):
        print(f, (BRAND / f).stat().st_size, 'bytes')
    print(TS.relative_to(ROOT), TS.stat().st_size, 'bytes')
