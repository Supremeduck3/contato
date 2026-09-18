# 🤝 Contato

Versão online e multiplayer do **Jogo do Contato**, o clássico jogo de palavras de roda.
Feito para grupos — **3 a 16 jogadores** na mesma sala (pensado para 6 ou mais).

Servidor em Node.js + Socket.IO, cliente em HTML/CSS/JS puro (sem build).

## Como rodar

```bash
npm install
npm start          # http://localhost:3000
```

Um jogador cria a sala e compartilha o código de 4 letras (ou o link com `#CODIGO`);
os outros entram pelo mesmo endereço. A porta pode ser trocada com `PORT=8080 npm start`.

## Regras

1. Um jogador é o **Dono da Palavra**: escolhe uma palavra secreta e revela só a primeira letra.
2. Os demais são **caçadores**. Cada um escreve uma **dica**: a definição de uma palavra que
   comece com as letras já reveladas — sem escrever a palavra em si, que fica secreta no servidor.
3. Quem acha que descobriu a palavra de uma dica clica em **CONTATO!** e manda seu palpite.
   Isso abre uma janela de tempo (15s por padrão) em que outros caçadores também podem entrar
   no mesmo contato.
4. Durante a janela, o **Dono pode bloquear**, dizendo qual é a palavra daquela dica:
   - **bloqueio certo** → contato anulado, nenhuma letra revelada, **+2** para o Dono;
   - **bloqueio errado ou nenhum** → se autor e contatante escreveram a mesma palavra,
     **mais uma letra é revelada** e cada um ganha **+1**.
5. A qualquer momento um caçador pode **arriscar a palavra secreta**: **+3** se acertar,
   **−1** se errar.
6. A rodada acaba quando a palavra é adivinhada, entregue pelo Dono, ou revelada por inteiro
   (aí o Dono não pontua). Se o Dono segurar a palavra até o fim da rodada, ganha **+2**.
7. O posto de Dono da Palavra gira a cada rodada. Por padrão joga-se uma rodada por jogador.

Acentos, maiúsculas e espaços são ignorados na comparação: `Coração` = `coracao`.

## Opções da sala

| Opção | Padrão | Faixa |
| --- | --- | --- |
| Segundos para bloquear | 15 | 5 – 60 |
| Rodadas | uma por jogador | 0 (= 1 por jogador) – 20 |
| Jogadores | até 16 | mínimo 3 para começar |

## O que o servidor esconde

A palavra secreta e as palavras por trás das dicas nunca são enviadas a quem não pode vê-las:
o estado é montado **por jogador** (`Jogo#estadoPara`). A palavra de uma dica só aparece para
todos depois que o contato é resolvido.

## Estrutura

```
server/game.js   regras do jogo (estado puro, sem rede) — o coração do projeto
server/index.js  servidor HTTP + Socket.IO, salas, relógio dos contatos
public/          cliente (index.html, styles.css, app.js)
test/            testes do motor de regras e um teste ponta a ponta com 6 sockets
```

## Testes

```bash
npm test
```

20 testes: regras (contato, bloqueio, revelação de letras, pontuação, rodadas, reconexão) e
uma partida completa com seis clientes reais conectados por WebSocket.

## Eventos de Socket.IO

| Cliente → servidor | Dados |
| --- | --- |
| `criarSala` | `{ nome, config }` |
| `entrarSala` | `{ sala, nome }` |
| `iniciar` | — |
| `definirPalavra` | `{ palavra }` |
| `darDica` | `{ texto, palavra }` |
| `contato` | `{ dica, palavra }` |
| `bloquear` | `{ dica, palavra }` |
| `arriscar` | `{ palavra }` |
| `entregarPalavra` / `proximaRodada` / `novoJogo` / `sair` | — |

Todos respondem por callback com `{ ok, erro? }`. O servidor transmite `estado` a cada mudança.
