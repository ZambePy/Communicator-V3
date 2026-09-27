// Motor de voz FALSO para os testes do `Sidecar` e da voz (`src/voz/*.test.ts`).
//
// Imita o laço de `voice-engine/irisflow_voz/__main__.py`: lê um pedido JSON
// por linha do stdin e processa UM por vez, na ordem — o Python é síncrono, e
// um `sair` que chega no meio de uma síntese só é lido quando ela acaba.
//
//   falar                texto "LENTO:<ms> ..." demora <ms> (padrão 10 ms) e
//                        grava um WAV falso em `saida`
//   preparar_referencia  entrada contendo "LENTO:<ms>" demora <ms>
//   baixar_modelo        demora MOTOR_DOWNLOAD_MS (padrão 10 ms)
//   sair                 responde e sai
//
// Cada passo vai para o arquivo em MOTOR_LOG (instante, pid, evento), quando
// definido — é assim que o teste sabe quantos processos existiram e quando.
const fs = require('node:fs');
const readline = require('node:readline');

const log = (m) => {
  if (process.env.MOTOR_LOG) fs.appendFileSync(process.env.MOTOR_LOG, `${Date.now()} pid=${process.pid} ${m}\n`);
};
log('iniciou');

const fila = [];
let ocupado = false;
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (l) => {
  if (l.trim()) {
    fila.push(JSON.parse(l));
    void bombear();
  }
});
rl.on('close', () => {
  fila.push({ id: -1, cmd: '__eof' });
  void bombear();
});

const responder = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const lento = (s) => {
  const m = /LENTO:(\d+)/.exec(String(s || ''));
  return m ? Number(m[1]) : 10;
};

async function bombear() {
  if (ocupado) return;
  ocupado = true;
  while (fila.length) {
    const p = fila.shift();
    log(`processando ${p.cmd} id=${p.id}`);
    if (p.cmd === '__eof') {
      log('stdin fechou; saindo');
      process.exit(0);
    }
    if (p.cmd === 'sair') {
      responder({ id: p.id, ok: true });
      log('saindo (sair)');
      process.exit(0);
    }
    if (p.cmd === 'falar') {
      await esperar(lento(p.texto));
      if (p.saida) fs.writeFileSync(p.saida, 'RIFF-falso-wav');
      responder({ id: p.id, ok: true, dispositivo: 'cpu' });
      log(`respondeu falar id=${p.id}`);
      continue;
    }
    if (p.cmd === 'preparar_referencia') {
      await esperar(lento(p.entrada));
      fs.writeFileSync(p.saida, 'RIFF-referencia-preparada');
      responder({ id: p.id, ok: true, duracao_util_s: 14, snr_db: 25, avisos: [] });
      log(`respondeu preparar id=${p.id}`);
      continue;
    }
    if (p.cmd === 'baixar_modelo') {
      await esperar(Number(process.env.MOTOR_DOWNLOAD_MS || 10));
      responder({ id: p.id, ok: true, ja_estava: false });
      continue;
    }
    responder({ id: p.id, ok: true, modelo_baixado: true, dispositivo: 'cpu', pronto: true });
  }
  ocupado = false;
}
