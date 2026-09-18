'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const { Jogo, ErroDeJogo, MODOS } = require('./game');

const PORTA = process.env.PORT || 3000;
const TICK_MS = 500;
const SALA_OCIOSA_MS = 1000 * 60 * 60 * 3; // 3h sem ninguém -> descarta

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const servidor = http.createServer(app);
const io = new Server(servidor);

/** @type {Map<string, {jogo: Jogo, ultimoUso: number}>} */
const salas = new Map();

function codigoAleatorio() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  for (let i = 0; i < 4; i++) codigo += letras[Math.floor(Math.random() * letras.length)];
  return codigo;
}

function novaSala(config) {
  let id = codigoAleatorio();
  while (salas.has(id)) id = codigoAleatorio();
  const jogo = new Jogo(id, config);
  salas.set(id, { jogo, ultimoUso: Date.now() });
  return jogo;
}

function pegarSala(id) {
  const entrada = salas.get(String(id || '').toUpperCase().trim());
  if (!entrada) return null;
  entrada.ultimoUso = Date.now();
  return entrada.jogo;
}

function transmitir(jogo) {
  for (const id of jogo.jogadores.keys()) {
    const socket = io.sockets.sockets.get(id);
    if (socket) socket.emit('estado', jogo.estadoPara(id));
  }
}

app.get('/api/salas/:id', (req, res) => {
  const jogo = pegarSala(req.params.id);
  if (!jogo) return res.status(404).json({ existe: false });
  res.json({
    existe: true,
    fase: jogo.fase,
    jogadores: jogo.jogadores.size,
    maxJogadores: jogo.config.maxJogadores,
  });
});

app.get('/api/saude', (_req, res) => res.json({ ok: true, salas: salas.size }));

io.on('connection', (socket) => {
  let salaAtual = null;

  const responder = (cb, fn) => {
    try {
      const resultado = fn() || {};
      if (typeof cb === 'function') cb({ ok: true, ...resultado });
    } catch (e) {
      if (!(e instanceof ErroDeJogo)) console.error(e);
      if (typeof cb === 'function') cb({ ok: false, erro: e.message || 'Erro inesperado.' });
      else socket.emit('erro', e.message);
    }
  };

  const jogoAtual = () => {
    const jogo = salaAtual ? pegarSala(salaAtual) : null;
    if (!jogo) throw new ErroDeJogo('Você não está em nenhuma sala.');
    return jogo;
  };

  const agir = (cb, fn) =>
    responder(cb, () => {
      const jogo = jogoAtual();
      const r = fn(jogo);
      transmitir(jogo);
      return r;
    });

  socket.on('criarSala', ({ nome, config } = {}, cb) =>
    responder(cb, () => {
      const limpa = {};
      if (config) {
        if (Number.isFinite(+config.segundosContato)) {
          limpa.segundosContato = Math.min(60, Math.max(5, Math.round(+config.segundosContato)));
        }
        if (Number.isFinite(+config.rodadas)) {
          limpa.rodadas = Math.min(20, Math.max(0, Math.round(+config.rodadas)));
        }
        if (MODOS.includes(config.modo)) limpa.modo = config.modo;
        if (Number.isFinite(+config.maxJogadores)) {
          limpa.maxJogadores = Math.min(16, Math.max(3, Math.round(+config.maxJogadores)));
        }
      }
      const jogo = novaSala(limpa);
      jogo.entrar(socket.id, nome);
      salaAtual = jogo.id;
      socket.join(jogo.id);
      transmitir(jogo);
      return { sala: jogo.id };
    }));

  socket.on('entrarSala', ({ sala, nome } = {}, cb) =>
    responder(cb, () => {
      const jogo = pegarSala(sala);
      if (!jogo) throw new ErroDeJogo('Sala não encontrada. Confira o código.');
      jogo.entrar(socket.id, nome);
      salaAtual = jogo.id;
      socket.join(jogo.id);
      transmitir(jogo);
      return { sala: jogo.id };
    }));

  socket.on('iniciar', (_dados, cb) => agir(cb, (jogo) => jogo.iniciar(socket.id)));
  socket.on('definirPalavra', ({ palavra } = {}, cb) =>
    agir(cb, (jogo) => jogo.definirPalavra(socket.id, palavra)));
  socket.on('darDica', ({ texto, palavra } = {}, cb) =>
    agir(cb, (jogo) => jogo.criarDica(socket.id, texto, palavra)));
  socket.on('contato', ({ dica, palavra } = {}, cb) =>
    agir(cb, (jogo) => jogo.darContato(socket.id, dica, palavra)));
  socket.on('bloquear', ({ dica, palavra } = {}, cb) =>
    agir(cb, (jogo) => jogo.bloquear(socket.id, dica, palavra)));
  socket.on('arriscar', ({ palavra } = {}, cb) =>
    agir(cb, (jogo) => jogo.arriscar(socket.id, palavra)));
  socket.on('entregarPalavra', (_dados, cb) => agir(cb, (jogo) => jogo.desistir(socket.id)));
  socket.on('proximaRodada', (_dados, cb) =>
    agir(cb, (jogo) => jogo.proximaRodada(socket.id)));
  socket.on('novoJogo', (_dados, cb) => agir(cb, (jogo) => jogo.iniciar(socket.id)));

  socket.on('sair', (_dados, cb) =>
    responder(cb, () => {
      const jogo = salaAtual ? pegarSala(salaAtual) : null;
      if (jogo) {
        jogo.desconectar(socket.id);
        socket.leave(jogo.id);
        transmitir(jogo);
      }
      salaAtual = null;
    }));

  socket.on('disconnect', () => {
    const jogo = salaAtual ? pegarSala(salaAtual) : null;
    if (!jogo) return;
    jogo.desconectar(socket.id);
    transmitir(jogo);
  });
});

// Relógio do servidor: resolve contatos cujo prazo estourou.
const relogio = setInterval(() => {
  const agora = Date.now();
  for (const [id, entrada] of salas) {
    if (entrada.jogo.resolverPrazos()) {
      entrada.ultimoUso = agora;
      transmitir(entrada.jogo);
    }
    const vazia = [...entrada.jogo.jogadores.values()].every((j) => !j.conectado);
    if (vazia && agora - entrada.ultimoUso > SALA_OCIOSA_MS) salas.delete(id);
  }
}, TICK_MS);
relogio.unref(); // não segura o processo (útil em testes)

if (require.main === module) {
  servidor.listen(PORTA, () => {
    console.log(`Contato rodando em http://localhost:${PORTA}`);
  });
}

module.exports = { app, servidor, io, salas };
