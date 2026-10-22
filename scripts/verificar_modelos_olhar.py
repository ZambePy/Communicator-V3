"""Confere o SINAL dos eixos dos modelos de olhar em rostos reais.

O que faz: detecta o rosto com o MediaPipe (o mesmo face_landmarker.task do
app), recorta como o app recorta (rosto: caixa dos 478 pontos x 1,4; olho:
96x64, fator 1,8, nivelado pela linha dos cantos e espelhado para a forma
canônica — ver src/l2cs/crop.ts e src/olho/recorte.ts) e roda os três modelos:

  - L2CS-Net Gaze360 (models/l2cs/l2cs_gaze360.onnx), em 448 e 224;
  - L2CS-Net GazeGene v2 (models/l2cs-gazegene/gazegene_l2cs_r50_v2.onnx), em 224;
  - EyeNet do ramo ocular (models/eyenet/eyenet.onnx), em cada olho.

Depois desloca as DUAS íris na própria foto (para a esquerda e a direita da
imagem, para cima e para baixo) e confere se cada modelo responde no sentido
da convenção do app:

  - rosto: yaw > 0 = olhar para a DIREITA DA PESSOA (íris para a esquerda de
    uma imagem não espelhada); pitch > 0 = olhar para CIMA;
  - EyeNet: yaw > 0 = íris para a direita DO RECORTE; pitch > 0 = para cima.

É um teste sintético: a íris deslocada não é um olhar de verdade, e as
MAGNITUDES não valem nada. O que vale é o SINAL. A validação definitiva
continua sendo a matriz de fotos reais de frontend/scripts/l2cs_axis_validation.mjs.

Uso (na raiz do repositório):
  pip install mediapipe onnxruntime opencv-python numpy
  python scripts/verificar_modelos_olhar.py site/public/team/gabriel-800.jpg site/public/team/giulia-800.jpg

Os ONNX ficam fora do git; sem um deles, aquele modelo é pulado.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys

import cv2
import numpy as np
import onnxruntime as ort
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision

MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
# Contornos dos olhos e anéis de íris do Face Mesh (478 pontos).
CONTORNO = {
    'img_esq': [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    'img_dir': [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
}
IRIS = {'img_esq': (468, [469, 470, 471, 472]), 'img_dir': (473, [474, 475, 476, 477])}
# Cantos usados pelo app (src/faceLandmarks.ts): OLHO_ESQUERDO = 33/133, OLHO_DIREITO = 263/362.
OLHOS_DO_APP = {'esquerdo': (133, 33), 'direito': (362, 263)}
# Deslocamento da íris em múltiplos do raio dela.
DESLOCAMENTOS = {'img_esq': (-0.45, 0.0), 'img_dir': (0.45, 0.0), 'cima': (0.0, -0.30), 'baixo': (0.0, 0.30)}


def carregar_detector(repo: str):
    caminho = os.path.join(repo, 'frontend/public/mediapipe/models/face_landmarker.task')
    opcoes = vision.FaceLandmarkerOptions(base_options=mpt.BaseOptions(model_asset_path=caminho), num_faces=4)
    return vision.FaceLandmarker.create_from_options(opcoes)


def pontos(detector, rgb: np.ndarray) -> list[np.ndarray]:
    r = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    h, w = rgb.shape[:2]
    return [np.array([[p.x * w, p.y * h] for p in rosto], np.float32) for rosto in r.face_landmarks]


def desloca_iris(rgb: np.ndarray, L: np.ndarray, dx_r: float, dy_r: float) -> np.ndarray:
    """Move as duas íris (dx, dy em raios da íris), recortadas pelo contorno do olho."""
    saida = rgb.copy()
    for lado in ('img_esq', 'img_dir'):
        i_centro, borda = IRIS[lado]
        c = L[i_centro]
        r = float(np.mean([np.linalg.norm(L[b] - c) for b in borda]))
        olho = np.zeros(rgb.shape[:2], np.uint8)
        cv2.fillPoly(olho, [L[CONTORNO[lado]].astype(np.int32)], 255)
        iris = np.zeros_like(olho)
        cv2.circle(iris, (int(round(c[0])), int(round(c[1]))), int(round(r * 1.08)), 255, -1)
        esclera_px = (olho > 0) & (iris == 0)
        if esclera_px.sum() < 5:
            continue
        pix = rgb[esclera_px].astype(np.float32)
        lum = pix.mean(1)
        esclera = np.median(pix[lum >= np.percentile(lum, 50)], axis=0)
        tmp = rgb.copy()
        tmp[(olho > 0) & (iris > 0)] = esclera.astype(np.uint8)
        M = np.float32([[1, 0, dx_r * r], [0, 1, dy_r * r]])
        movida = cv2.warpAffine(rgb, M, (rgb.shape[1], rgb.shape[0]), flags=cv2.INTER_LINEAR)
        mascara = cv2.warpAffine(iris, M, (rgb.shape[1], rgb.shape[0]), flags=cv2.INTER_NEAREST)
        sel = (olho > 0) & (mascara > 0)
        tmp[sel] = movida[sel]
        saida[olho > 0] = tmp[olho > 0]
    return saida


def recorte_afim(rgb, a, b, c, d, e, f, W, H):
    return cv2.warpAffine(rgb, np.float32([[a, c, e], [b, d, f]]), (W, H), flags=cv2.INTER_LINEAR)


def tensor(recorte: np.ndarray) -> np.ndarray:
    x = (recorte.astype(np.float32) / 255.0 - MEAN) / STD
    return x.transpose(2, 0, 1)[None].astype(np.float32)


def recorte_do_rosto(rgb, L, lado: int, fator: float = 1.4):
    mn, mx = L.min(0), L.max(0)
    cx, cy = (mn + mx) / 2
    k = lado / (max(mx - mn) * fator)
    return recorte_afim(rgb, k, 0, 0, k, lado / 2 - k * cx, lado / 2 - k * cy, lado, lado)


def recorte_do_olho(rgb, interno, externo, olho: str, espelhado: bool = False, W=96, H=64, fator=1.8):
    """Mesma matriz de src/olho/recorte.ts. Devolve o recorte e o sinal do eixo x."""
    cx, cy = (interno + externo) / 2
    k = W / (float(np.linalg.norm(externo - interno)) * fator)
    ang = math.atan2(externo[1] - interno[1], externo[0] - interno[0])
    if ang > math.pi / 2:
        ang -= math.pi
    elif ang <= -math.pi / 2:
        ang += math.pi
    th = -ang
    sx = -1 if (espelhado != (olho == 'esquerdo')) else 1
    co, se = math.cos(th), math.sin(th)
    a, b, c, d = sx * k * co, k * se, sx * k * -se, k * co
    e, f = W / 2 - (a * cx + c * cy), H / 2 - (b * cx + d * cy)
    return recorte_afim(rgb, a, b, c, d, e, f, W, H), (1 if a > 0 else -1)


def decodifica(logits, n, largura, offset, modo):
    z = np.asarray(logits, np.float64)
    p = np.exp(z - z.max())
    p /= p.sum()
    graus = np.arange(n) * largura + offset
    if modo == 'linear':
        return float((p * graus).sum())
    rad = np.radians(graus)
    return float(np.degrees(math.atan2((p * np.sin(rad)).sum(), (p * np.cos(rad)).sum())))


def carregar_modelo(onnx: str, meta_path: str):
    if not os.path.exists(onnx):
        return None
    meta = json.load(open(meta_path, encoding='utf-8'))
    sessao = ort.InferenceSession(onnx, providers=['CPUExecutionProvider'])
    modo = meta.get('decoding') or ('circular' if meta['outputBins'] * meta['binWidth'] >= 360 else 'linear')
    sinais = meta.get('sinais') or {'yaw': 1, 'pitch': 1}
    nomes = [o.name for o in sessao.get_outputs()]

    def roda(t):
        o = dict(zip(nomes, sessao.run(None, {meta['inputTensorName']: t})))
        y = decodifica(o[meta['outputTensorNames']['yaw']][0], meta['outputBins'], meta['binWidth'], meta['binOffset'], modo)
        p = decodifica(o[meta['outputTensorNames']['pitch']][0], meta['outputBins'], meta['binWidth'], meta['binOffset'], modo)
        return sinais['yaw'] * y, sinais['pitch'] * p

    return roda


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('fotos', nargs='+', help='fotos com rosto(s) de frente')
    ap.add_argument('--repo', default='.', help='raiz do repositório (padrão: pasta atual)')
    args = ap.parse_args()
    modelos_dir = os.path.join(args.repo, 'frontend/public/models')

    rosto = {
        'gaze360_448': (carregar_modelo(f'{modelos_dir}/l2cs/l2cs_gaze360.onnx', f'{modelos_dir}/l2cs/l2cs.meta.json'), 448),
        'gaze360_224': (carregar_modelo(f'{modelos_dir}/l2cs/l2cs_gaze360.onnx', f'{modelos_dir}/l2cs/l2cs.meta.json'), 224),
        'gazegene_224': (carregar_modelo(f'{modelos_dir}/l2cs-gazegene/gazegene_l2cs_r50_v2.onnx',
                                         f'{modelos_dir}/l2cs-gazegene/gazegene_l2cs_r50_v2.meta.json'), 224),
    }
    rosto = {k: v for k, v in rosto.items() if v[0] is not None}
    olho = carregar_modelo(f'{modelos_dir}/eyenet/eyenet.onnx', f'{modelos_dir}/eyenet/eyenet.meta.json')
    detector = carregar_detector(args.repo)

    acertos: dict[tuple[str, str], list[int]] = {}

    def conta(modelo, eixo, delta, esperado):
        r = acertos.setdefault((modelo, eixo), [0, 0])
        r[1] += 1
        if abs(delta) > 0.5 and np.sign(delta) == esperado:
            r[0] += 1

    n_rostos = 0
    for foto in args.fotos:
        bgr = cv2.imread(foto)
        if bgr is None:
            print(f'não abriu {foto}', file=sys.stderr)
            continue
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        for L in pontos(detector, rgb):
            n_rostos += 1

            def mede(img):
                res = {nome: m(tensor(recorte_do_rosto(img, L, lado))) for nome, (m, lado) in rosto.items()}
                if olho:
                    for lado_do_olho, (i_int, i_ext) in OLHOS_DO_APP.items():
                        rec, eixo_x = recorte_do_olho(img, L[i_int], L[i_ext], lado_do_olho)
                        res[f'eyenet_{lado_do_olho}'] = olho(tensor(rec)) + (eixo_x,)
                return res

            base = mede(rgb)
            for chave, (dx, dy) in DESLOCAMENTOS.items():
                novo = mede(desloca_iris(rgb, L, dx, dy))
                for modelo in base:
                    eixo = 'yaw' if chave in ('img_esq', 'img_dir') else 'pitch'
                    i = 0 if eixo == 'yaw' else 1
                    if modelo.startswith('eyenet'):
                        eixo_x = base[modelo][2]
                        esperado = {'img_esq': -eixo_x, 'img_dir': eixo_x, 'cima': 1, 'baixo': -1}[chave]
                    else:
                        esperado = {'img_esq': 1, 'img_dir': -1, 'cima': 1, 'baixo': -1}[chave]
                    conta(modelo, eixo, novo[modelo][i] - base[modelo][i], esperado)

    print(f'{n_rostos} rosto(s) em {len(args.fotos)} foto(s)')
    for (modelo, eixo), (ok, tot) in sorted(acertos.items()):
        print(f'  {modelo:18s} {eixo:5s} {ok}/{tot} deslocamentos no sinal esperado')
    return 0 if n_rostos else 1


if __name__ == '__main__':
    sys.exit(main())
