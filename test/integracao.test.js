'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { servidor } = require('../server/index');

function conectar(porta) {
  return new Promise((resolve, reject) => {
    const socket = io(`http://localhost:${porta}`, { transports: ['websocket'] });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

const pedir = (socket, evento, dados) =>
  new Promise((resolve) => socket.emit(evento, dados, resolve));

/** Espera o próximo estado que satisfaça a condição. */
function esperarEstado(socket, condicao, prazo = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off('estado', ouvinte);
      reject(new Error('tempo esgotado esperando estado'));
    }, prazo);
    function ouvinte(estado) {
      if (!condicao(estado)) return;
      clearTimeout(t);
      socket.off('estado', ouvinte);
      resolve(estado);
    }
    socket.on('estado', ouvinte);
  });
}

test('partida completa com seis jogadores pela rede', async (t) => {
  await new Promise((r) => servidor.listen(0, r));
  const porta = servidor.address().port;
  const sockets = [];
  t.after(() => {
    for (const s of sockets) s.close();
    servidor.close();
  });

  const dono = await conectar(porta);
  sockets.push(dono);
  const criada = await pedir(dono, 'criarSala', {
    nome: 'Dono',
    config: { segundosContato: 5 }, // 5s é o mínimo aceito pelo servidor
  });
  assert.equal(criada.ok, true);
  const sala = criada.sala;

  for (let i = 2; i <= 6; i++) {
    const s = await conectar(porta);
    sockets.push(s);
    const r = await pedir(s, 'entrarSala', { sala, nome: `Jogador${i}` });
    assert.equal(r.ok, true, r.erro);
  }

  const cacador = sockets[1];
  const contatante = sockets[2];

  const emJogo = esperarEstado(cacador, (e) => e.fase === 'escolha');
  assert.equal((await pedir(dono, 'iniciar')).ok, true);
  const estadoEscolha = await emJogo;
  assert.equal(estadoEscolha.jogadores.length, 6);
  assert.equal(estadoEscolha.euSouDono, false);

  const jogando = esperarEstado(cacador, (e) => e.fase === 'jogando');
  assert.equal((await pedir(dono, 'definirPalavra', { palavra: 'girassol' })).ok, true);
  const estadoJogando = await jogando;
  assert.equal(estadoJogando.prefixo, 'G');
  assert.equal(estadoJogando.segredo, null, 'caçador não vê a palavra');

  const comDica = esperarEstado(contatante, (e) => e.dicas.length === 1);
  assert.equal((await pedir(cacador, 'darDica', {
    texto: 'onde os pinguins vivem',
    palavra: 'gelo',
  })).ok, true);
  const estadoDica = await comDica;
  assert.equal(estadoDica.dicas[0].palavra, null, 'palavra da dica fica secreta');

  // contato sem bloqueio: o tick do servidor resolve no prazo
  const revelou = esperarEstado(contatante, (e) => e.prefixo === 'GI', 9000);
  assert.equal((await pedir(contatante, 'contato', {
    dica: estadoDica.dicas[0].id,
    palavra: 'gelo',
  })).ok, true);
  const estadoRevelado = await revelou;
  assert.equal(estadoRevelado.dicas[0].estado, 'encerrada');
  assert.equal(estadoRevelado.dicas[0].palavra, 'GELO');
  assert.equal(estadoRevelado.jogadores.find((j) => j.sou).pontos, 1);

  // erros voltam pelo callback, sem derrubar ninguém
  const recusa = await pedir(contatante, 'definirPalavra', { palavra: 'outra' });
  assert.equal(recusa.ok, false);

  const fim = esperarEstado(dono, (e) => e.fase === 'fimRodada');
  assert.equal((await pedir(contatante, 'arriscar', { palavra: 'girassol' })).ok, true);
  const estadoFim = await fim;
  assert.equal(estadoFim.resultadoRodada.tipo, 'acertou');
  assert.equal(estadoFim.segredo, 'GIRASSOL');

  const proxima = esperarEstado(cacador, (e) => e.fase === 'escolha' && e.rodada === 2);
  assert.equal((await pedir(dono, 'proximaRodada')).ok, true);
  const r2 = await proxima;
  assert.equal(r2.euSouDono, true, 'o posto de dono passou para o próximo');
});
