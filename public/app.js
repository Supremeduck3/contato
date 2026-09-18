'use strict';

const socket = io();
const $ = (id) => document.getElementById(id);
let estado = null;
let ultimoPrefixo = '';

function mostrarErro(texto, onde = 'erro-jogo') {
  const alvo = $(onde);
  alvo.textContent = texto || '';
  if (texto) setTimeout(() => { if (alvo.textContent === texto) alvo.textContent = ''; }, 4000);
}

function emitir(evento, dados, onde = 'erro-jogo') {
  socket.emit(evento, dados, (resposta) => {
    if (resposta && !resposta.ok) mostrarErro(resposta.erro, onde);
  });
}

// ------------------------------------------------------------------ entrada

function nome() {
  return $('in-nome').value.trim();
}

$('btn-criar').onclick = () => {
  if (!nome()) return mostrarErro('Escolha um apelido.', 'erro-entrada');
  socket.emit(
    'criarSala',
    {
      nome: nome(),
      config: {
        segundosContato: +$('in-segundos').value,
        rodadas: +$('in-rodadas').value,
        modo: document.querySelector('input[name="modo"]:checked').value,
      },
    },
    (r) => {
      if (!r.ok) return mostrarErro(r.erro, 'erro-entrada');
      localStorage.setItem('contato:nome', nome());
      history.replaceState(null, '', '#' + r.sala);
    },
  );
};

$('btn-entrar').onclick = () => {
  if (!nome()) return mostrarErro('Escolha um apelido.', 'erro-entrada');
  const sala = $('in-sala').value.trim().toUpperCase();
  if (!sala) return mostrarErro('Digite o código da sala.', 'erro-entrada');
  socket.emit('entrarSala', { sala, nome: nome() }, (r) => {
    if (!r.ok) return mostrarErro(r.erro, 'erro-entrada');
    localStorage.setItem('contato:nome', nome());
    history.replaceState(null, '', '#' + r.sala);
  });
};

$('in-sala').addEventListener('keydown', (e) => e.key === 'Enter' && $('btn-entrar').click());
$('in-nome').addEventListener('keydown', (e) => e.key === 'Enter' && $('in-sala').focus());

for (const radio of document.querySelectorAll('input[name="modo"]')) {
  radio.addEventListener('change', () => {
    for (const label of document.querySelectorAll('.modo')) {
      label.classList.toggle('selecionado', label.contains(radio) && radio.checked);
    }
  });
}

// ------------------------------------------------------------------- ações

$('btn-iniciar').onclick = () => emitir('iniciar');
$('btn-proxima').onclick = () => emitir('proximaRodada');
$('btn-novo-jogo').onclick = () => emitir('novoJogo');
$('btn-entregar').onclick = () => {
  if (confirm('Entregar a palavra e encerrar a rodada?')) emitir('entregarPalavra');
};
$('btn-pular').onclick = () => {
  if (confirm('Pular esta palavra e encerrar a rodada?')) emitir('entregarPalavra');
};
$('btn-arriscar-dono').onclick = () => {
  const palavra = $('in-arriscar-dono').value;
  if (!palavra.trim()) return mostrarErro('Escreva a palavra que você quer arriscar.');
  socket.emit('arriscar', { palavra }, (r) => {
    if (!r.ok) return mostrarErro(r.erro);
    $('in-arriscar-dono').value = '';
  });
};
$('in-arriscar-dono').addEventListener(
  'keydown',
  (e) => e.key === 'Enter' && $('btn-arriscar-dono').click(),
);
$('btn-sair').onclick = () => {
  emitir('sair');
  estado = null;
  history.replaceState(null, '', location.pathname);
  $('tela-jogo').classList.add('oculto');
  $('tela-entrada').classList.remove('oculto');
};
$('btn-copiar').onclick = () => {
  navigator.clipboard?.writeText(location.href).then(
    () => mostrarErro('Link copiado!'),
    () => mostrarErro('Copie o código: ' + estado.sala),
  );
};

$('btn-definir').onclick = () => {
  const palavra = $('in-palavra-secreta').value;
  emitir('definirPalavra', { palavra });
  $('in-palavra-secreta').value = '';
};
$('in-palavra-secreta').addEventListener('keydown', (e) => e.key === 'Enter' && $('btn-definir').click());

$('btn-dica').onclick = () => {
  const palavra = $('in-dica-palavra').value;
  const texto = $('in-dica-texto').value;
  socket.emit('darDica', { texto, palavra }, (r) => {
    if (!r.ok) return mostrarErro(r.erro);
    $('in-dica-palavra').value = '';
    $('in-dica-texto').value = '';
  });
};
$('in-dica-texto').addEventListener('keydown', (e) => e.key === 'Enter' && $('btn-dica').click());

$('btn-arriscar').onclick = () => {
  const palavra = $('in-arriscar').value;
  if (!palavra.trim()) return mostrarErro('Escreva a palavra que você quer arriscar.');
  socket.emit('arriscar', { palavra }, (r) => {
    if (!r.ok) return mostrarErro(r.erro);
    $('in-arriscar').value = '';
  });
};
$('in-arriscar').addEventListener('keydown', (e) => e.key === 'Enter' && $('btn-arriscar').click());

// ---------------------------------------------------------------- renderiza

socket.on('estado', (novo) => {
  estado = novo;
  render();
});
socket.on('erro', (msg) => mostrarErro(msg));
socket.on('disconnect', () => mostrarErro('Conexão perdida. Tentando reconectar…'));

function render() {
  if (!estado) return;
  $('tela-entrada').classList.add('oculto');
  $('tela-jogo').classList.remove('oculto');

  $('lbl-sala').textContent = estado.sala;
  $('lbl-rodada').textContent =
    estado.fase === 'lobby' ? 'no lobby' : `rodada ${estado.rodada} de ${estado.totalRodadas}`;
  const surpresa = estado.modo === 'surpresa';
  $('painel-palavra').querySelector('.rotulo').innerHTML = surpresa
    ? 'Palavra sorteada · guardião: <b id="lbl-dono">—</b>'
    : 'Palavra do <b id="lbl-dono">—</b>';
  $('lbl-dono').textContent = estado.euSouDono ? 'você' : estado.donoNome;
  $('lbl-tema').classList.toggle('oculto', !estado.tema);
  if (estado.tema) $('lbl-tema').textContent = `🎲 tema: ${estado.tema}`;
  $('lbl-dono-espera').textContent = estado.donoNome;

  renderLetras();
  renderPaineis();
  renderDicas();
  renderPlacar();
  renderLog();
}

function renderLetras() {
  const caixa = $('letras');
  caixa.innerHTML = '';
  if (estado.fase === 'lobby' || estado.fase === 'escolha') {
    $('estado-msg').textContent =
      estado.fase === 'lobby'
        ? 'A palavra aparece aqui quando o jogo começar.'
        : 'Aguardando a palavra secreta…';
    return;
  }
  const mostrar = estado.segredo || estado.prefixo;
  [...mostrar].forEach((letra, i) => {
    const div = document.createElement('div');
    div.className = 'letra' + (i >= estado.prefixo.length ? ' vazia' : '');
    if (i === estado.prefixo.length - 1 && estado.prefixo !== ultimoPrefixo) div.classList.add('nova');
    div.textContent = letra;
    caixa.appendChild(div);
  });
  if (!estado.segredo) {
    const div = document.createElement('div');
    div.className = 'letra vazia';
    div.textContent = '?';
    caixa.appendChild(div);
  }
  ultimoPrefixo = estado.prefixo;
  if (estado.modo === 'surpresa' && !estado.segredo) {
    $('estado-msg').textContent =
      `Palavra sorteada do tema "${estado.tema}" — ninguém sabe qual é. ` +
      `${estado.reveladas} letra(s) reveladas.`;
  } else if (estado.euSouDono && estado.segredo) {
    $('estado-msg').textContent =
      `Sua palavra: ${estado.segredo}. ${estado.reveladas} letra(s) reveladas.`;
  } else {
    $('estado-msg').textContent =
      `${estado.reveladas} letra(s) reveladas. ` +
      `Dê dicas de palavras que comecem com "${estado.prefixo}".`;
  }
}

function renderPaineis() {
  const ver = (id, condicao) => $(id).classList.toggle('oculto', !condicao);
  ver('acao-lobby', estado.fase === 'lobby');
  ver('acao-escolha-dono', estado.fase === 'escolha' && estado.euSouDono);
  ver('acao-escolha-espera', estado.fase === 'escolha' && !estado.euSouDono);
  const surpresa = estado.modo === 'surpresa';
  ver('acao-dica', estado.fase === 'jogando' && !estado.euSouDono);
  ver('acao-dono', estado.fase === 'jogando' && estado.euSouDono && !surpresa);
  ver('acao-guardiao', estado.fase === 'jogando' && estado.euSouDono && surpresa);
  $('btn-pular').classList.toggle('oculto', !(estado.euSouDono || estado.euSouAnfitriao));
  ver('acao-fim-rodada', estado.fase === 'fimRodada');
  ver('acao-fim-jogo', estado.fase === 'fimJogo');

  const conectados = estado.jogadores.filter((j) => j.conectado).length;
  $('btn-iniciar').disabled = !estado.euSouAnfitriao || conectados < 3;
  $('btn-iniciar').textContent = estado.euSouAnfitriao
    ? conectados < 3
      ? `Faltam ${3 - conectados} jogador(es)`
      : `Começar com ${conectados} jogadores`
    : 'Só o anfitrião começa o jogo';

  if (estado.fase === 'fimRodada' && estado.resultadoRodada) {
    $('lbl-fim-rodada').textContent = estado.resultadoRodada.texto;
    $('btn-proxima').textContent =
      estado.rodada >= estado.totalRodadas ? 'Ver resultado final' : 'Próxima rodada';
  }
  if (estado.fase === 'fimJogo') {
    $('lbl-vencedores').textContent = `Vencedor(es): ${estado.vencedores.join(', ')}`;
    $('btn-novo-jogo').disabled = !estado.euSouAnfitriao;
  }
}

function renderDicas() {
  const caixa = $('dicas');
  caixa.innerHTML = '';
  if (!estado.dicas.length) {
    caixa.innerHTML = '<p class="vazio">Nenhuma dica ainda.</p>';
    return;
  }
  for (const dica of estado.dicas) caixa.appendChild(cartaoDica(dica));
}

function cartaoDica(dica) {
  const el = document.createElement('div');
  el.className = 'dica ' + dica.estado;

  const cabeca = document.createElement('div');
  cabeca.className = 'cabeca';
  cabeca.innerHTML = `<span class="autor">${escapar(dica.souAutor ? 'Você' : dica.autorNome)}</span>`;
  if (dica.estado === 'emContato' && dica.prazo) {
    const timer = document.createElement('span');
    timer.className = 'cronometro';
    timer.dataset.prazo = dica.prazo;
    cabeca.appendChild(timer);
  }
  el.appendChild(cabeca);

  const texto = document.createElement('div');
  texto.className = 'texto';
  texto.textContent = dica.texto;
  el.appendChild(texto);

  if (dica.souAutor && dica.estado !== 'encerrada') {
    const minha = document.createElement('div');
    minha.className = 'minha-palavra';
    minha.textContent = `sua palavra: ${dica.palavra}`;
    el.appendChild(minha);
  }

  if (dica.contatos.length) {
    const c = document.createElement('div');
    c.className = 'contatos';
    c.textContent =
      'Em contato: ' +
      dica.contatos
        .map((x) => (x.sou ? 'você' : x.nome) + (x.palavra ? ` (${x.palavra})` : ''))
        .join(', ');
    el.appendChild(c);
  }

  if (dica.estado === 'encerrada' && dica.resultado) {
    const r = document.createElement('div');
    r.className = 'resultado ' + dica.resultado.tipo;
    r.textContent = dica.resultado.texto || `Palavra da dica: ${dica.palavra}`;
    el.appendChild(r);
    return el;
  }

  // ações disponíveis
  if (estado.fase !== 'jogando') return el;

  if (estado.euSouDono && dica.estado === 'emContato' && !dica.bloqueio) {
    el.appendChild(
      formulario('Qual é a palavra dela?', 'BLOQUEAR', 'perigo', (valor) =>
        emitir('bloquear', { dica: dica.id, palavra: valor }),
      ),
    );
  } else if (!estado.euSouDono && !dica.souAutor && !dica.jaContatei) {
    el.appendChild(
      formulario('Acho que é…', 'CONTATO!', 'contato', (valor) =>
        emitir('contato', { dica: dica.id, palavra: valor }),
      ),
    );
  }
  return el;
}

function formulario(placeholder, rotulo, classe, acao) {
  const linha = document.createElement('div');
  linha.className = 'linha';
  const input = document.createElement('input');
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  const botao = document.createElement('button');
  botao.className = classe;
  botao.textContent = rotulo;
  const enviar = () => {
    if (!input.value.trim()) return mostrarErro('Escreva a palavra.');
    acao(input.value);
    input.value = '';
  };
  botao.onclick = enviar;
  input.addEventListener('keydown', (e) => e.key === 'Enter' && enviar());
  linha.append(input, botao);
  return linha;
}

function renderPlacar() {
  const lista = $('placar');
  lista.innerHTML = '';
  const ordenados = [...estado.jogadores].sort((a, b) => b.pontos - a.pontos);
  for (const j of ordenados) {
    const li = document.createElement('li');
    if (!j.conectado) li.className = 'off';
    const esq = document.createElement('span');
    esq.textContent = j.sou ? `${j.nome} (você)` : j.nome;
    if (j.dono) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'dono';
      esq.append(' ', tag);
    }
    const dir = document.createElement('span');
    dir.className = 'pontos';
    dir.textContent = j.pontos;
    li.append(esq, dir);
    lista.appendChild(li);
  }
}

function renderLog() {
  const lista = $('log');
  lista.innerHTML = '';
  for (const linha of estado.log) {
    const li = document.createElement('li');
    li.textContent = linha.texto;
    lista.appendChild(li);
  }
}

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// cronômetros dos contatos
setInterval(() => {
  for (const el of document.querySelectorAll('.cronometro')) {
    const restante = Math.max(0, Math.ceil((+el.dataset.prazo - Date.now()) / 1000));
    el.textContent = `⏱ ${restante}s`;
  }
}, 250);

// pré-preenche apelido e sala pela URL
$('in-nome').value = localStorage.getItem('contato:nome') || '';
if (location.hash.length > 1) $('in-sala').value = location.hash.slice(1).toUpperCase();
