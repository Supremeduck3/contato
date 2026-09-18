'use strict';

/**
 * Lógica pura do Jogo do Contato.
 *
 * Regras implementadas:
 *  - Um jogador é o Dono da Palavra: escolhe uma palavra secreta e revela só a 1ª letra.
 *  - Os demais (caçadores) escrevem dicas: uma definição de uma palavra que começa
 *    com as letras já reveladas. A palavra da dica fica escondida.
 *  - Quem acha que descobriu a palavra de uma dica dá "Contato!" e envia seu palpite.
 *    Abre-se uma janela de tempo em que outros também podem entrar no contato.
 *  - Durante a janela, o Dono da Palavra pode BLOQUEAR, dizendo a palavra da dica.
 *      * Bloqueio certo  -> contato anulado, +1 ponto para o Dono.
 *      * Bloqueio errado -> se autor e contatante bateram, revela-se mais uma letra.
 *  - Caçadores também podem arriscar a palavra secreta inteira.
 *  - A rodada acaba quando a palavra é adivinhada ou totalmente revelada.
 *  - O posto de Dono da Palavra gira a cada rodada.
 *
 * Dois modos:
 *  - 'classico':  o Dono escolhe a palavra e é o único que a conhece.
 *  - 'surpresa':  o servidor sorteia um TEMA aleatório e uma palavra dele.
 *                 Ninguém sabe a palavra — nem o Dono, que vira só o guardião:
 *                 bloqueia contatos e também pode arriscar a palavra secreta.
 */

const { sortear } = require('./palavras');

const PONTOS = {
  CONTATO_AUTOR: 1,
  CONTATO_CACADOR: 1,
  BLOQUEIO: 2,
  ACERTO_FINAL: 3,
  ERRO_FINAL: -1,
  DONO_SOBREVIVEU: 2,
};

const PADRAO = {
  minJogadores: 3,
  maxJogadores: 16,
  segundosContato: 15,
  tamanhoMinimoPalavra: 4,
  rodadas: 0, // 0 = uma rodada por jogador
  modo: 'classico', // 'classico' | 'surpresa'
};

const MODOS = ['classico', 'surpresa'];

/** Remove acentos, espaços e caixa para comparar palavras. */
function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function agora() {
  return Date.now();
}

class ErroDeJogo extends Error {}

function erro(msg) {
  throw new ErroDeJogo(msg);
}

class Jogo {
  constructor(id, config = {}) {
    this.id = id;
    this.config = { ...PADRAO, ...config };
    this.fase = 'lobby'; // lobby | escolha | jogando | fimRodada | fimJogo
    this.jogadores = new Map(); // id -> { id, nome, pontos, conectado, entrouEm }
    this.ordem = [];
    this.donoIndex = 0;
    this.rodada = 0;
    this.totalRodadas = 0;
    this.segredo = '';
    this.tema = null;
    this.usadas = new Set(); // palavras já sorteadas nesta partida
    this.reveladas = 0;
    this.dicas = [];
    this.proximaDicaId = 1;
    this.log = [];
    this.vencedores = [];
  }

  // ---------------------------------------------------------------- jogadores

  get surpresa() {
    return this.config.modo === 'surpresa';
  }

  /** Quem pode arriscar / dar dicas muda um pouco entre os modos. */
  get dono() {
    return this.ordem[this.donoIndex] || null;
  }

  jogadoresAtivos() {
    return this.ordem.map((id) => this.jogadores.get(id)).filter((j) => j && j.conectado);
  }

  entrar(id, nome) {
    const limpo = String(nome || '').trim().slice(0, 20);
    if (!limpo) erro('Escolha um apelido.');
    if (this.jogadores.size >= this.config.maxJogadores) {
      erro(`A sala está cheia (máx. ${this.config.maxJogadores} jogadores).`);
    }
    const nomeEmUso = [...this.jogadores.values()].some(
      (j) => j.id !== id && normalizar(j.nome) === normalizar(limpo),
    );
    if (nomeEmUso) erro('Esse apelido já está em uso nesta sala.');
    if (this.fase !== 'lobby' && !this.jogadores.has(id)) {
      // entra como espectador que já pontua a partir da próxima rodada
      this.jogadores.set(id, { id, nome: limpo, pontos: 0, conectado: true, entrouEm: agora() });
      this.ordem.push(id);
      this.registrar(`${limpo} entrou e joga a partir da próxima rodada.`);
      return this.jogadores.get(id);
    }
    const jogador = { id, nome: limpo, pontos: 0, conectado: true, entrouEm: agora() };
    this.jogadores.set(id, jogador);
    if (!this.ordem.includes(id)) this.ordem.push(id);
    this.registrar(`${limpo} entrou na sala.`);
    return jogador;
  }

  desconectar(id) {
    const jogador = this.jogadores.get(id);
    if (!jogador) return;
    jogador.conectado = false;
    this.registrar(`${jogador.nome} saiu.`);
    if (this.fase === 'lobby') {
      this.jogadores.delete(id);
      this.ordem = this.ordem.filter((x) => x !== id);
      if (this.donoIndex >= this.ordem.length) this.donoIndex = 0;
    }
  }

  reconectar(idAntigo, idNovo) {
    const jogador = this.jogadores.get(idAntigo);
    if (!jogador) return null;
    this.jogadores.delete(idAntigo);
    jogador.id = idNovo;
    jogador.conectado = true;
    this.jogadores.set(idNovo, jogador);
    this.ordem = this.ordem.map((x) => (x === idAntigo ? idNovo : x));
    for (const dica of this.dicas) {
      if (dica.autorId === idAntigo) dica.autorId = idNovo;
      for (const c of dica.contatos) if (c.jogadorId === idAntigo) c.jogadorId = idNovo;
    }
    this.registrar(`${jogador.nome} voltou.`);
    return jogador;
  }

  // ------------------------------------------------------------------ rodadas

  iniciar(idSolicitante) {
    if (this.fase !== 'lobby' && this.fase !== 'fimJogo') erro('O jogo já está rolando.');
    if (idSolicitante && this.ordem[0] !== idSolicitante) erro('Só o anfitrião pode começar.');
    const ativos = this.jogadoresAtivos();
    if (ativos.length < this.config.minJogadores) {
      erro(`São necessários pelo menos ${this.config.minJogadores} jogadores.`);
    }
    for (const j of this.jogadores.values()) j.pontos = 0;
    this.rodada = 0;
    this.donoIndex = 0;
    this.totalRodadas = this.config.rodadas > 0 ? this.config.rodadas : this.ordem.length;
    this.vencedores = [];
    this.usadas = new Set();
    this.registrar(
      this.surpresa
        ? 'O jogo começou no modo Palavra Surpresa: ninguém sabe a palavra!'
        : 'O jogo começou!',
    );
    this.novaRodada();
  }

  novaRodada() {
    this.rodada += 1;
    this.dicas = [];
    this.segredo = '';
    this.tema = null;
    this.reveladas = 0;

    if (this.surpresa) {
      const sorteio = sortear(this.usadas, this.aleatorio || Math.random);
      this.usadas.add(sorteio.palavra);
      this.segredo = sorteio.palavra;
      this.tema = sorteio.tema;
      this.reveladas = 1;
      this.fase = 'jogando';
      this.registrar(
        `Rodada ${this.rodada}: tema sorteado "${this.tema}", a palavra começa com ` +
          `"${this.prefixo().toUpperCase()}" — e ninguém sabe qual é. ` +
          `${this.nomeDe(this.dono)} é o guardião e só pode bloquear.`,
      );
      return;
    }

    this.fase = 'escolha';
    this.registrar(`Rodada ${this.rodada}: ${this.nomeDe(this.dono)} é o Dono da Palavra.`);
  }

  definirPalavra(idJogador, palavra) {
    if (this.surpresa) erro('Neste modo a palavra é sorteada pelo servidor.');
    if (this.fase !== 'escolha') erro('Não é hora de escolher a palavra.');
    if (idJogador !== this.dono) erro('Só o Dono da Palavra escolhe a palavra.');
    const limpa = normalizar(palavra);
    if (limpa.length < this.config.tamanhoMinimoPalavra) {
      erro(`A palavra precisa ter ao menos ${this.config.tamanhoMinimoPalavra} letras.`);
    }
    if (!/^[a-z]+$/.test(limpa)) erro('Use apenas uma palavra, sem números ou símbolos.');
    this.segredo = limpa;
    this.reveladas = 1;
    this.fase = 'jogando';
    this.registrar(`A palavra começa com "${this.prefixo().toUpperCase()}".`);
  }

  prefixo() {
    return this.segredo.slice(0, this.reveladas);
  }

  // -------------------------------------------------------------------- dicas

  criarDica(idJogador, texto, palavra) {
    if (this.fase !== 'jogando') erro('A rodada não está em andamento.');
    if (idJogador === this.dono) erro('O Dono da Palavra não dá dicas.');
    const jogador = this.jogadores.get(idJogador) || erro('Jogador desconhecido.');
    const alvo = normalizar(palavra);
    const dica = String(texto || '').trim().slice(0, 240);
    if (!dica) erro('Escreva a definição da sua palavra.');
    if (!alvo) erro('Informe a palavra secreta da sua dica.');
    if (!alvo.startsWith(this.prefixo())) {
      erro(`Sua palavra precisa começar com "${this.prefixo().toUpperCase()}".`);
    }
    if (alvo === this.segredo) {
      if (!this.surpresa) {
        erro('Essa é a palavra do Dono! Use o botão de arriscar a palavra secreta.');
      }
      // ninguém sabia a palavra: quem a escreveu numa dica acertou sem querer
      this.registrar(`${jogador.nome} escreveu a palavra secreta numa dica!`);
      this.arriscar(idJogador, alvo);
      return null;
    }
    const palavras = dica.split(/\s+/).map(normalizar).filter(Boolean);
    if (palavras.some((p) => p.includes(alvo))) {
      erro('A dica não pode conter a própria palavra.');
    }
    const nova = {
      id: this.proximaDicaId++,
      autorId: idJogador,
      autorNome: jogador.nome,
      texto: dica,
      palavra: alvo,
      estado: 'aberta', // aberta | emContato | encerrada
      contatos: [],
      bloqueio: null,
      prazo: null,
      resultado: null,
      criadaEm: agora(),
    };
    this.dicas.unshift(nova);
    this.registrar(`${jogador.nome} deu uma dica.`);
    return nova;
  }

  buscarDica(id) {
    return this.dicas.find((d) => d.id === Number(id)) || erro('Dica não encontrada.');
  }

  /** Um caçador declara contato com uma dica. Retorna o prazo de resolução. */
  darContato(idJogador, idDica, palavra) {
    if (this.fase !== 'jogando') erro('A rodada não está em andamento.');
    if (idJogador === this.dono) erro('O Dono da Palavra não dá contato — ele bloqueia.');
    const dica = this.buscarDica(idDica);
    if (dica.estado === 'encerrada') erro('Essa dica já foi resolvida.');
    if (dica.autorId === idJogador) erro('Você não pode dar contato na sua própria dica.');
    const alvo = normalizar(palavra);
    if (!alvo) erro('Diga qual palavra você acha que é.');
    if (dica.contatos.some((c) => c.jogadorId === idJogador)) {
      erro('Você já entrou neste contato.');
    }
    dica.contatos.push({
      jogadorId: idJogador,
      nome: this.nomeDe(idJogador),
      palavra: alvo,
      em: agora(),
    });
    if (dica.estado === 'aberta') {
      dica.estado = 'emContato';
      dica.prazo = agora() + this.config.segundosContato * 1000;
      this.registrar(
        `${this.nomeDe(idJogador)} deu CONTATO na dica de ${dica.autorNome}! ` +
          `${this.nomeDe(this.dono)} tem ${this.config.segundosContato}s para bloquear.`,
      );
    } else {
      this.registrar(`${this.nomeDe(idJogador)} também entrou no contato.`);
    }
    return dica;
  }

  /** O Dono da Palavra tenta bloquear um contato em andamento. */
  bloquear(idJogador, idDica, palavra) {
    if (this.fase !== 'jogando') erro('A rodada não está em andamento.');
    if (idJogador !== this.dono) erro('Só o Dono da Palavra pode bloquear.');
    const dica = this.buscarDica(idDica);
    if (dica.estado !== 'emContato') erro('Não há contato em andamento nessa dica.');
    if (dica.bloqueio) erro('Você já tentou bloquear este contato.');
    const alvo = normalizar(palavra);
    if (!alvo) erro('Diga a palavra que você acha que é a da dica.');
    dica.bloqueio = { palavra: alvo, em: agora() };
    this.registrar(`${this.nomeDe(idJogador)} tentou bloquear!`);
    return this.resolverDica(dica);
  }

  /** Resolve uma dica em contato (chamada pelo bloqueio ou pelo fim do prazo). */
  resolverDica(dica) {
    if (dica.estado !== 'emContato') return null;
    dica.estado = 'encerrada';
    dica.prazo = null;

    const bloqueioCerto = dica.bloqueio && dica.bloqueio.palavra === dica.palavra;
    const acertaram = dica.contatos.filter((c) => c.palavra === dica.palavra);

    if (bloqueioCerto) {
      this.pontuar(this.dono, PONTOS.BLOQUEIO);
      dica.resultado = {
        tipo: 'bloqueado',
        palavra: dica.palavra,
        texto:
          `BLOQUEADO! ${this.nomeDe(this.dono)} acertou "${dica.palavra.toUpperCase()}" ` +
          `(+${PONTOS.BLOQUEIO}) e nenhuma letra foi revelada.`,
      };
    } else if (acertaram.length > 0) {
      this.pontuar(dica.autorId, PONTOS.CONTATO_AUTOR);
      for (const c of acertaram) this.pontuar(c.jogadorId, PONTOS.CONTATO_CACADOR);
      const nomes = acertaram.map((c) => c.nome).join(', ');
      const revelou = this.revelarLetra();
      dica.resultado = {
        tipo: 'contato',
        palavra: dica.palavra,
        texto:
          `CONTATO! ${dica.autorNome} e ${nomes} disseram "${dica.palavra.toUpperCase()}". ` +
          (revelou
            ? `Nova letra revelada: "${this.prefixo().toUpperCase()}".`
            : 'A palavra foi revelada por completo!'),
      };
    } else {
      dica.resultado = {
        tipo: 'falhou',
        palavra: dica.palavra,
        texto:
          `Contato falhou. A palavra da dica era "${dica.palavra.toUpperCase()}" ` +
          `e ninguém bateu com ela.`,
      };
    }
    this.registrar(dica.resultado.texto);
    return dica;
  }

  /** Revela mais uma letra; encerra a rodada se a palavra acabar. */
  revelarLetra() {
    this.reveladas += 1;
    if (this.reveladas >= this.segredo.length) {
      this.reveladas = this.segredo.length;
      this.encerrarRodada({
        tipo: 'revelada',
        texto: `A palavra "${this.segredo.toUpperCase()}" foi totalmente revelada. ${this.nomeDe(
          this.dono,
        )} perdeu a palavra!`,
      });
      return false;
    }
    // dicas antigas que não servem mais para o novo prefixo saem de cena
    for (const dica of this.dicas) {
      if (dica.estado === 'aberta' && !dica.palavra.startsWith(this.prefixo())) {
        dica.estado = 'encerrada';
        dica.resultado = {
          tipo: 'expirada',
          palavra: dica.palavra,
          texto: `A dica de ${dica.autorNome} ("${dica.palavra.toUpperCase()}") não serve mais.`,
        };
      }
    }
    return true;
  }

  /** Um caçador arrisca a palavra secreta inteira. */
  arriscar(idJogador, palavra) {
    if (this.fase !== 'jogando') erro('A rodada não está em andamento.');
    if (idJogador === this.dono && !this.surpresa) erro('Você é o Dono da Palavra.');
    const alvo = normalizar(palavra);
    if (!alvo) erro('Escreva a palavra.');
    if (alvo === this.segredo) {
      this.pontuar(idJogador, PONTOS.ACERTO_FINAL);
      this.encerrarRodada({
        tipo: 'acertou',
        texto: `${this.nomeDe(idJogador)} matou a palavra: "${this.segredo.toUpperCase()}" ` +
          `(+${PONTOS.ACERTO_FINAL})!`,
      });
      return { acertou: true };
    }
    this.pontuar(idJogador, PONTOS.ERRO_FINAL);
    this.registrar(
      `${this.nomeDe(idJogador)} arriscou "${alvo.toUpperCase()}" e errou (${PONTOS.ERRO_FINAL}).`,
    );
    return { acertou: false };
  }

  /** O Dono desiste e entrega a palavra. */
  desistir(idJogador) {
    if (this.fase !== 'jogando') erro('A rodada não está em andamento.');
    if (this.surpresa) {
      if (idJogador !== this.dono && this.ordem[0] !== idJogador) {
        erro('Só o guardião ou o anfitrião pode pular a palavra.');
      }
      this.encerrarRodada({
        tipo: 'desistiu',
        texto:
          `${this.nomeDe(idJogador)} pulou a rodada. A palavra era ` +
          `"${this.segredo.toUpperCase()}" (tema: ${this.tema}).`,
      });
      return;
    }
    if (idJogador !== this.dono) erro('Só o Dono da Palavra pode entregar a palavra.');
    this.encerrarRodada({
      tipo: 'desistiu',
      texto: `${this.nomeDe(idJogador)} entregou a palavra: "${this.segredo.toUpperCase()}".`,
    });
  }

  encerrarRodada(resultado) {
    if (resultado.tipo === 'bloqueado' || resultado.tipo === 'desistiu') {
      // nada extra
    }
    if (!this.surpresa && resultado.tipo !== 'revelada' && resultado.tipo !== 'desistiu') {
      this.pontuar(this.dono, PONTOS.DONO_SOBREVIVEU);
    }
    this.fase = 'fimRodada';
    this.reveladas = this.segredo.length;
    for (const dica of this.dicas) {
      if (dica.estado !== 'encerrada') {
        dica.estado = 'encerrada';
        dica.resultado = dica.resultado || { tipo: 'expirada', palavra: dica.palavra, texto: '' };
      }
    }
    this.resultadoRodada = resultado;
    this.registrar(resultado.texto);
  }

  /** Avança para a próxima rodada (ou encerra o jogo). */
  proximaRodada(idSolicitante) {
    if (this.fase !== 'fimRodada') erro('A rodada ainda não acabou.');
    if (idSolicitante && this.ordem[0] !== idSolicitante && idSolicitante !== this.dono) {
      erro('Só o anfitrião ou o Dono da Palavra pode seguir.');
    }
    if (this.rodada >= this.totalRodadas) {
      this.fase = 'fimJogo';
      const placar = [...this.jogadores.values()].sort((a, b) => b.pontos - a.pontos);
      const topo = placar.length ? placar[0].pontos : 0;
      this.vencedores = placar.filter((j) => j.pontos === topo).map((j) => j.nome);
      this.registrar(`Fim de jogo! Vencedor(es): ${this.vencedores.join(', ')}.`);
      return;
    }
    this.donoIndex = (this.donoIndex + 1) % this.ordem.length;
    this.resultadoRodada = null;
    this.novaRodada();
  }

  // ------------------------------------------------------------------ apoio

  pontuar(idJogador, pontos) {
    const jogador = this.jogadores.get(idJogador);
    if (jogador) jogador.pontos += pontos;
  }

  nomeDe(id) {
    const jogador = this.jogadores.get(id);
    return jogador ? jogador.nome : 'alguém';
  }

  registrar(texto) {
    this.log.unshift({ em: agora(), texto });
    if (this.log.length > 60) this.log.pop();
  }

  /** Dicas cujo prazo de contato estourou — o servidor chama isso num tick. */
  resolverPrazos() {
    const vencidas = this.dicas.filter(
      (d) => d.estado === 'emContato' && d.prazo && d.prazo <= agora(),
    );
    for (const dica of vencidas) this.resolverDica(dica);
    return vencidas.length > 0;
  }

  /**
   * Estado visível por um jogador. Esconde a palavra secreta e as palavras
   * das dicas que ainda estão em aberto.
   */
  estadoPara(idJogador) {
    const souDono = idJogador === this.dono;
    return {
      sala: this.id,
      fase: this.fase,
      rodada: this.rodada,
      totalRodadas: this.totalRodadas,
      config: this.config,
      modo: this.config.modo,
      tema: this.tema,
      euSouDono: souDono,
      euSouAnfitriao: this.ordem[0] === idJogador,
      donoId: this.dono,
      donoNome: this.nomeDe(this.dono),
      prefixo: this.prefixo().toUpperCase(),
      reveladas: this.reveladas,
      // no modo surpresa nem o guardião vê a palavra antes do fim da rodada
      segredo:
        (souDono && !this.surpresa) || this.fase === 'fimRodada' || this.fase === 'fimJogo'
          ? this.segredo.toUpperCase()
          : null,
      resultadoRodada: this.resultadoRodada || null,
      vencedores: this.vencedores,
      jogadores: this.ordem
        .map((id) => this.jogadores.get(id))
        .filter(Boolean)
        .map((j) => ({
          id: j.id,
          nome: j.nome,
          pontos: j.pontos,
          conectado: j.conectado,
          dono: j.id === this.dono,
          sou: j.id === idJogador,
        })),
      dicas: this.dicas.map((d) => ({
        id: d.id,
        autorNome: d.autorNome,
        souAutor: d.autorId === idJogador,
        texto: d.texto,
        estado: d.estado,
        prazo: d.prazo,
        // a palavra só aparece para o autor ou depois de resolvida
        palavra:
          d.autorId === idJogador || d.estado === 'encerrada' ? d.palavra.toUpperCase() : null,
        contatos: d.contatos.map((c) => ({
          nome: c.nome,
          sou: c.jogadorId === idJogador,
          palavra: d.estado === 'encerrada' ? c.palavra.toUpperCase() : null,
        })),
        jaContatei: d.contatos.some((c) => c.jogadorId === idJogador),
        bloqueio: d.bloqueio ? { palavra: d.bloqueio.palavra.toUpperCase() } : null,
        resultado: d.resultado,
      })),
      log: this.log.slice(0, 30),
    };
  }
}

module.exports = { Jogo, ErroDeJogo, normalizar, PONTOS, PADRAO, MODOS };
