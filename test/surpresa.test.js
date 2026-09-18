'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Jogo, ErroDeJogo } = require('../server/game');
const { BANCO, NOMES_DOS_TEMAS, sortear } = require('../server/palavras');

/** Mesa de 6 jogadores no modo Palavra Surpresa, com sorteio controlado. */
function mesaSurpresa(config = {}) {
  const jogo = new Jogo('SURP', { modo: 'surpresa', ...config });
  for (let i = 1; i <= 6; i++) jogo.entrar(`p${i}`, `Jogador${i}`);
  jogo.iniciar('p1');
  return jogo;
}

test('o banco de temas é válido: palavras únicas, minúsculas e com 4+ letras', () => {
  assert.ok(NOMES_DOS_TEMAS.length >= 15, 'poucos temas');
  for (const tema of NOMES_DOS_TEMAS) {
    const palavras = BANCO[tema];
    assert.ok(palavras.length >= 10, `tema ${tema} tem poucas palavras`);
    assert.equal(new Set(palavras).size, palavras.length, `tema ${tema} tem repetidas`);
    for (const p of palavras) {
      assert.match(p, /^[a-z]{4,}$/, `palavra inválida em ${tema}: ${p}`);
    }
  }
});

test('temas de cultura pop estão disponíveis', () => {
  for (const tema of ['Cinema', 'Futebol (times)', 'Games', 'Mitologia']) {
    assert.ok(NOMES_DOS_TEMAS.includes(tema), `faltou o tema ${tema}`);
  }
  assert.ok(BANCO['Futebol (times)'].includes('flamengo'));
  assert.ok(BANCO['Cinema'].includes('titanic'));
});

test('sortear evita palavras já usadas na partida', () => {
  const usadas = new Set();
  for (let i = 0; i < 100; i++) {
    const { tema, palavra } = sortear(usadas);
    assert.ok(NOMES_DOS_TEMAS.includes(tema));
    assert.ok(BANCO[tema].includes(palavra));
    assert.ok(!usadas.has(palavra), `repetiu ${palavra}`);
    usadas.add(palavra);
  }
});

test('a rodada já começa jogando, com tema sorteado e uma letra revelada', () => {
  const jogo = mesaSurpresa();
  assert.equal(jogo.fase, 'jogando');
  assert.ok(NOMES_DOS_TEMAS.includes(jogo.tema));
  assert.ok(BANCO[jogo.tema].includes(jogo.segredo));
  assert.equal(jogo.reveladas, 1);
});

test('nem o guardião vê a palavra durante a rodada', () => {
  const jogo = mesaSurpresa();
  assert.equal(jogo.estadoPara(jogo.dono).segredo, null);
  assert.equal(jogo.estadoPara('p3').segredo, null);
  assert.equal(jogo.estadoPara('p3').tema, jogo.tema, 'o tema é público');
  jogo.desistir(jogo.dono);
  assert.equal(jogo.estadoPara('p3').segredo, jogo.segredo.toUpperCase());
});

test('o guardião não escolhe palavra neste modo', () => {
  const jogo = mesaSurpresa();
  assert.throws(() => jogo.definirPalavra(jogo.dono, 'qualquer'), ErroDeJogo);
});

test('o guardião pode arriscar a palavra secreta e ganha os mesmos pontos', () => {
  const jogo = mesaSurpresa();
  const guardiao = jogo.dono;
  jogo.arriscar(guardiao, jogo.segredo + 'zz');
  assert.equal(jogo.jogadores.get(guardiao).pontos, -1);
  jogo.arriscar(guardiao, jogo.segredo);
  assert.equal(jogo.fase, 'fimRodada');
  assert.equal(jogo.jogadores.get(guardiao).pontos, 2, '-1 do erro +3 do acerto');
});

test('o guardião não ganha o bônus de sobreviver com a palavra', () => {
  const jogo = mesaSurpresa();
  jogo.arriscar('p2', jogo.segredo);
  assert.equal(jogo.jogadores.get(jogo.dono).pontos, 0);
  assert.equal(jogo.jogadores.get('p2').pontos, 3);
});

test('o guardião continua bloqueando contatos normalmente', () => {
  const jogo = mesaSurpresa();
  const prefixo = jogo.prefixo();
  const dica = jogo.criarDica('p2', 'uma definicao qualquer', prefixo + 'zzzz');
  jogo.darContato('p3', dica.id, prefixo + 'zzzz');
  jogo.bloquear(jogo.dono, dica.id, prefixo + 'zzzz');
  assert.equal(jogo.dicas[0].resultado.tipo, 'bloqueado');
  assert.equal(jogo.jogadores.get(jogo.dono).pontos, 2);
  assert.equal(jogo.prefixo(), prefixo, 'bloqueio impede a revelação');
});

test('escrever a palavra secreta numa dica conta como palpite certo', () => {
  const jogo = mesaSurpresa();
  const segredo = jogo.segredo;
  const resultado = jogo.criarDica('p2', 'uma definicao qualquer', segredo);
  assert.equal(resultado, null);
  assert.equal(jogo.fase, 'fimRodada');
  assert.equal(jogo.jogadores.get('p2').pontos, 3);
  assert.equal(jogo.dicas.length, 0, 'a dica não vai para a mesa');
});

test('o anfitrião também pode pular a palavra sorteada', () => {
  const jogo = mesaSurpresa();
  assert.throws(() => jogo.desistir('p4'), ErroDeJogo);
  jogo.desistir('p1');
  assert.equal(jogo.fase, 'fimRodada');
  assert.equal(jogo.resultadoRodada.tipo, 'desistiu');
  assert.match(jogo.resultadoRodada.texto, /tema:/);
});

test('cada rodada sorteia uma palavra nova e o guardião gira', () => {
  const jogo = mesaSurpresa({ rodadas: 4 });
  const vistas = new Set();
  for (let i = 0; i < 4; i++) {
    assert.equal(jogo.fase, 'jogando');
    assert.ok(!vistas.has(jogo.segredo), 'repetiu palavra na mesma partida');
    vistas.add(jogo.segredo);
    jogo.desistir(jogo.dono);
    jogo.proximaRodada('p1');
  }
  assert.equal(jogo.fase, 'fimJogo');
  assert.equal(vistas.size, 4);
});

test('o modo clássico segue intacto', () => {
  const jogo = new Jogo('CLAS');
  for (let i = 1; i <= 6; i++) jogo.entrar(`p${i}`, `Jogador${i}`);
  jogo.iniciar('p1');
  assert.equal(jogo.fase, 'escolha');
  assert.equal(jogo.tema, null);
  jogo.definirPalavra('p1', 'girassol');
  assert.equal(jogo.estadoPara('p1').segredo, 'GIRASSOL');
  assert.throws(() => jogo.arriscar('p1', 'girassol'), ErroDeJogo);
  assert.throws(() => jogo.criarDica('p2', 'a flor do sol', 'girassol'), ErroDeJogo);
});

// ------------------------------------------------- guardião dando dicas

test('o guardião dá dicas como todo mundo e pontua pelo contato', () => {
  const jogo = mesaSurpresa();
  const guardiao = jogo.dono;
  const alvo = jogo.prefixo() + 'zzzz';
  const dica = jogo.criarDica(guardiao, 'uma definicao do guardiao', alvo);
  assert.equal(dica.autorId, guardiao);
  jogo.darContato('p3', dica.id, alvo);
  jogo.resolverDica(dica);
  assert.equal(jogo.jogadores.get(guardiao).pontos, 1);
  assert.equal(jogo.jogadores.get('p3').pontos, 1);
  assert.equal(jogo.reveladas, 2);
});

test('ninguém bloqueia a dica do próprio guardião', () => {
  const jogo = mesaSurpresa();
  const guardiao = jogo.dono;
  const alvo = jogo.prefixo() + 'zzzz';
  const dica = jogo.criarDica(guardiao, 'uma definicao do guardiao', alvo);
  jogo.darContato('p2', dica.id, alvo);
  assert.throws(() => jogo.bloquear(guardiao, dica.id, alvo), ErroDeJogo);
  assert.equal(jogo.dicas[0].estado, 'emContato', 'o contato segue de pé');
  jogo.resolverDica(dica);
  assert.equal(jogo.dicas[0].resultado.tipo, 'contato');
});

test('o guardião continua sem dar contato nas dicas alheias', () => {
  const jogo = mesaSurpresa();
  const alvo = jogo.prefixo() + 'zzzz';
  const dica = jogo.criarDica('p2', 'uma definicao qualquer', alvo);
  assert.throws(() => jogo.darContato(jogo.dono, dica.id, alvo), ErroDeJogo);
});

test('no modo clássico o Dono continua sem dar dicas', () => {
  const jogo = new Jogo('CL2');
  for (let i = 1; i <= 6; i++) jogo.entrar(`p${i}`, `Jogador${i}`);
  jogo.iniciar('p1');
  jogo.definirPalavra('p1', 'girassol');
  assert.throws(() => jogo.criarDica('p1', 'uma definicao', 'gelo'), ErroDeJogo);
});

// --------------------------------------------------- escolha de temas

test('a sala pode limitar os temas do sorteio', () => {
  const jogo = mesaSurpresa({ temas: ['Cinema'], rodadas: 6 });
  for (let i = 0; i < 6; i++) {
    assert.equal(jogo.tema, 'Cinema');
    assert.ok(BANCO['Cinema'].includes(jogo.segredo));
    jogo.desistir('p1');
    jogo.proximaRodada('p1');
  }
});

test('o anfitrião troca os temas entre as rodadas', () => {
  const jogo = mesaSurpresa({ rodadas: 3 });
  assert.deepEqual(jogo.temasEmJogo(), NOMES_DOS_TEMAS, 'começa com todos');
  assert.throws(() => jogo.definirTemas('p1', ['Games']), ErroDeJogo, /rodada/);
  jogo.desistir('p1');
  jogo.definirTemas('p1', ['Games', 'Mitologia']);
  jogo.proximaRodada('p1');
  assert.ok(['Games', 'Mitologia'].includes(jogo.tema));
});

test('só o anfitrião muda os temas, e só temas que existem', () => {
  const jogo = mesaSurpresa();
  jogo.desistir('p1');
  assert.throws(() => jogo.definirTemas('p3', ['Games']), ErroDeJogo);
  assert.throws(() => jogo.definirTemas('p1', ['Culinária Molecular']), ErroDeJogo);
  assert.deepEqual(jogo.temasEmJogo(), NOMES_DOS_TEMAS, 'nada mudou');
});

test('escolher todos os temas volta ao padrão', () => {
  const jogo = mesaSurpresa({ temas: ['Cinema'] });
  jogo.desistir('p1');
  assert.deepEqual(jogo.temasEmJogo(), ['Cinema']);
  assert.deepEqual(jogo.definirTemas('p1', NOMES_DOS_TEMAS), []);
  assert.deepEqual(jogo.temasEmJogo(), NOMES_DOS_TEMAS);
  assert.deepEqual(jogo.definirTemas('p1', []), [], 'lista vazia = todos');
});

test('trocar temas não existe no modo clássico', () => {
  const jogo = new Jogo('CL3');
  for (let i = 1; i <= 3; i++) jogo.entrar(`p${i}`, `J${i}`);
  assert.throws(() => jogo.definirTemas('p1', ['Cinema']), ErroDeJogo);
});

test('um tema esgotado não trava o sorteio', () => {
  const jogo = mesaSurpresa({ temas: ['Cinema'], rodadas: 20 });
  const palavras = BANCO['Cinema'].length;
  for (let i = 0; i < palavras + 3; i++) {
    assert.equal(jogo.tema, 'Cinema');
    jogo.desistir('p1');
    if (jogo.rodada >= jogo.totalRodadas) break;
    jogo.proximaRodada('p1');
  }
});
