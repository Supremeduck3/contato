'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Jogo, ErroDeJogo } = require('../server/game');

/** Cria uma sala com 6 jogadores já em partida, com a palavra definida. */
function mesaDeSeis(palavra = 'girassol', config = {}) {
  const jogo = new Jogo('TEST', config);
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  ids.forEach((id, i) => jogo.entrar(id, `Jogador${i + 1}`));
  jogo.iniciar('p1');
  jogo.definirPalavra(jogo.dono, palavra);
  return { jogo, ids };
}

test('sala suporta seis jogadores e gira o dono da palavra', () => {
  const { jogo } = mesaDeSeis();
  assert.equal(jogo.jogadores.size, 6);
  assert.equal(jogo.totalRodadas, 6);
  assert.equal(jogo.dono, 'p1');
  jogo.desistir('p1');
  jogo.proximaRodada('p1');
  assert.equal(jogo.dono, 'p2');
  assert.equal(jogo.fase, 'escolha');
});

test('não começa com menos de três jogadores', () => {
  const jogo = new Jogo('X');
  jogo.entrar('a', 'Ana');
  jogo.entrar('b', 'Bia');
  assert.throws(() => jogo.iniciar('a'), ErroDeJogo);
});

test('só a primeira letra é revelada e o segredo fica escondido dos caçadores', () => {
  const { jogo } = mesaDeSeis('girassol');
  assert.equal(jogo.prefixo(), 'g');
  assert.equal(jogo.estadoPara('p2').segredo, null);
  assert.equal(jogo.estadoPara('p1').segredo, 'GIRASSOL');
});

test('dica precisa começar com o prefixo e não pode conter a palavra', () => {
  const { jogo } = mesaDeSeis('girassol');
  assert.throws(() => jogo.criarDica('p2', 'animal listrado', 'zebra'), ErroDeJogo);
  assert.throws(() => jogo.criarDica('p2', 'um gato preto', 'gato'), ErroDeJogo);
  assert.throws(() => jogo.criarDica('p1', 'qualquer coisa', 'gelo'), ErroDeJogo);
  const dica = jogo.criarDica('p2', 'onde os pinguins vivem', 'gelo');
  assert.equal(dica.estado, 'aberta');
});

test('a palavra da dica fica secreta até a resolução', () => {
  const { jogo } = mesaDeSeis('girassol');
  const dica = jogo.criarDica('p2', 'onde os pinguins vivem', 'gelo');
  assert.equal(jogo.estadoPara('p3').dicas[0].palavra, null);
  assert.equal(jogo.estadoPara('p2').dicas[0].palavra, 'GELO');
  jogo.darContato('p3', dica.id, 'gelo');
  jogo.resolverDica(dica);
  assert.equal(jogo.estadoPara('p4').dicas[0].palavra, 'GELO');
});

test('contato bem sucedido revela mais uma letra e pontua os dois', () => {
  const { jogo } = mesaDeSeis('girassol');
  const dica = jogo.criarDica('p2', 'onde os pinguins vivem', 'gelo');
  jogo.darContato('p3', dica.id, 'gelo');
  jogo.resolverDica(dica);
  assert.equal(jogo.prefixo(), 'gi');
  assert.equal(jogo.jogadores.get('p2').pontos, 1);
  assert.equal(jogo.jogadores.get('p3').pontos, 1);
  assert.equal(jogo.jogadores.get('p1').pontos, 0);
});

test('vários caçadores podem entrar no mesmo contato', () => {
  const { jogo } = mesaDeSeis('girassol');
  const dica = jogo.criarDica('p2', 'onde os pinguins vivem', 'gelo');
  jogo.darContato('p3', dica.id, 'gelo');
  jogo.darContato('p4', dica.id, 'gelo');
  jogo.darContato('p5', dica.id, 'garfo');
  jogo.resolverDica(dica);
  assert.equal(jogo.jogadores.get('p3').pontos, 1);
  assert.equal(jogo.jogadores.get('p4').pontos, 1);
  assert.equal(jogo.jogadores.get('p5').pontos, 0);
  assert.equal(jogo.prefixo(), 'gi');
});

test('bloqueio certo do dono anula o contato', () => {
  const { jogo } = mesaDeSeis('girassol');
  const dica = jogo.criarDica('p2', 'onde os pinguins vivem', 'gelo');
  jogo.darContato('p3', dica.id, 'gelo');
  jogo.bloquear('p1', dica.id, 'GELO');
  assert.equal(jogo.prefixo(), 'g');
  assert.equal(jogo.jogadores.get('p1').pontos, 2);
  assert.equal(jogo.jogadores.get('p2').pontos, 0);
  assert.equal(jogo.dicas[0].resultado.tipo, 'bloqueado');
});

test('bloqueio errado deixa o contato acontecer', () => {
  const { jogo } = mesaDeSeis('girassol');
  const dica = jogo.criarDica('p2', 'onde os pinguins vivem', 'gelo');
  jogo.darContato('p3', dica.id, 'gelo');
  jogo.bloquear('p1', dica.id, 'geleira');
  assert.equal(jogo.prefixo(), 'gi');
  assert.equal(jogo.jogadores.get('p1').pontos, 0);
  assert.equal(jogo.jogadores.get('p3').pontos, 1);
});

test('contato falho não revela letra', () => {
  const { jogo } = mesaDeSeis('girassol');
  const dica = jogo.criarDica('p2', 'onde os pinguins vivem', 'gelo');
  jogo.darContato('p3', dica.id, 'garfo');
  jogo.resolverDica(dica);
  assert.equal(jogo.prefixo(), 'g');
  assert.equal(jogo.dicas[0].resultado.tipo, 'falhou');
});

test('só o dono bloqueia e ninguém contata a própria dica', () => {
  const { jogo } = mesaDeSeis('girassol');
  const dica = jogo.criarDica('p2', 'onde os pinguins vivem', 'gelo');
  assert.throws(() => jogo.darContato('p2', dica.id, 'gelo'), ErroDeJogo);
  assert.throws(() => jogo.darContato('p1', dica.id, 'gelo'), ErroDeJogo);
  jogo.darContato('p3', dica.id, 'gelo');
  assert.throws(() => jogo.darContato('p3', dica.id, 'gelo'), ErroDeJogo);
  assert.throws(() => jogo.bloquear('p4', dica.id, 'gelo'), ErroDeJogo);
});

test('o prazo do contato resolve sozinho no tick do servidor', async () => {
  const { jogo } = mesaDeSeis('girassol', { segundosContato: 0.05 });
  const dica = jogo.criarDica('p2', 'onde os pinguins vivem', 'gelo');
  jogo.darContato('p3', dica.id, 'gelo');
  assert.equal(jogo.resolverPrazos(), false);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(jogo.resolverPrazos(), true);
  assert.equal(jogo.prefixo(), 'gi');
});

test('dicas que não servem mais ao novo prefixo são descartadas', () => {
  const { jogo } = mesaDeSeis('girassol');
  const velha = jogo.criarDica('p4', 'felino domestico', 'gato');
  const dica = jogo.criarDica('p2', 'onde os pinguins vivem', 'gelo');
  jogo.darContato('p3', dica.id, 'gelo');
  jogo.resolverDica(dica);
  const atualizada = jogo.dicas.find((d) => d.id === velha.id);
  assert.equal(atualizada.estado, 'encerrada');
  assert.equal(atualizada.resultado.tipo, 'expirada');
});

test('arriscar a palavra certa encerra a rodada; errar custa ponto', () => {
  const { jogo } = mesaDeSeis('girassol');
  jogo.arriscar('p2', 'girafa');
  assert.equal(jogo.jogadores.get('p2').pontos, -1);
  assert.equal(jogo.fase, 'jogando');
  jogo.arriscar('p3', 'Girassol');
  assert.equal(jogo.fase, 'fimRodada');
  assert.equal(jogo.jogadores.get('p3').pontos, 3);
  assert.equal(jogo.jogadores.get('p1').pontos, 2, 'dono sobreviveu com a palavra');
});

test('revelar todas as letras encerra a rodada sem ponto para o dono', () => {
  const { jogo } = mesaDeSeis('gelo');
  const palavras = [
    ['galo', 'ave da fazenda'],
    ['gelo', 'agua dura'],
  ];
  // 'g' -> 'ge' -> 'gel' -> 'gelo'
  let n = 0;
  while (jogo.fase === 'jogando' && n < 5) {
    const palavra = jogo.segredo.slice(0, jogo.reveladas + 1) + 'x';
    const dica = jogo.criarDica('p2', `definicao ${n}`, palavra);
    jogo.darContato('p3', dica.id, palavra);
    jogo.resolverDica(dica);
    n++;
  }
  assert.equal(jogo.fase, 'fimRodada');
  assert.equal(jogo.resultadoRodada.tipo, 'revelada');
  assert.equal(jogo.jogadores.get('p1').pontos, 0);
  assert.ok(palavras.length);
});

test('normalização ignora acentos e caixa', () => {
  const { jogo } = mesaDeSeis('coração');
  assert.equal(jogo.segredo, 'coracao');
  const dica = jogo.criarDica('p2', 'bebida quente da manhã', 'Cafe');
  jogo.darContato('p3', dica.id, 'CAFÉ');
  jogo.resolverDica(dica);
  assert.equal(jogo.prefixo(), 'co');
});

test('o jogo termina depois da última rodada e aponta o vencedor', () => {
  const { jogo } = mesaDeSeis('gelo', { rodadas: 2 });
  assert.equal(jogo.totalRodadas, 2);
  jogo.arriscar('p2', 'gelo');
  jogo.proximaRodada('p1');
  assert.equal(jogo.dono, 'p2');
  jogo.definirPalavra('p2', 'barco');
  jogo.arriscar('p3', 'barco');
  jogo.proximaRodada('p1');
  assert.equal(jogo.fase, 'fimJogo');
  assert.deepEqual(jogo.vencedores, ['Jogador2']);
});

test('desconexão e reconexão preservam pontos e dicas', () => {
  const { jogo } = mesaDeSeis('girassol');
  const dica = jogo.criarDica('p2', 'onde os pinguins vivem', 'gelo');
  jogo.darContato('p3', dica.id, 'gelo');
  jogo.resolverDica(dica);
  jogo.desconectar('p2');
  assert.equal(jogo.jogadores.get('p2').conectado, false);
  jogo.reconectar('p2', 'novo2');
  assert.equal(jogo.jogadores.get('novo2').pontos, 1);
  assert.equal(jogo.dicas.find((d) => d.id === dica.id).autorId, 'novo2');
  assert.ok(jogo.ordem.includes('novo2'));
});

test('apelidos duplicados e sala cheia são recusados', () => {
  const jogo = new Jogo('Y', { maxJogadores: 3 });
  jogo.entrar('a', 'Ana');
  assert.throws(() => jogo.entrar('b', 'ana'), ErroDeJogo);
  jogo.entrar('b', 'Bia');
  jogo.entrar('c', 'Caio');
  assert.throws(() => jogo.entrar('d', 'Davi'), ErroDeJogo);
});
