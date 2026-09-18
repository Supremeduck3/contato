'use strict';

/**
 * Banco de palavras usado no modo "Palavra Surpresa": o servidor sorteia um
 * tema e uma palavra dele. Ninguém — nem o Dono da Palavra — sabe qual é.
 *
 * Regras do banco: palavras comuns, de 4 letras ou mais, sem espaços.
 * A acentuação é normalizada na carga, então pode escrever natural.
 */

const TEMAS = {
  'Animais': [
    'girafa', 'tartaruga', 'jacare', 'capivara', 'coruja', 'formiga', 'baleia',
    'morcego', 'cavalo', 'pinguim', 'lagarto', 'aranha', 'golfinho', 'tubarao',
    'esquilo', 'camelo', 'raposa', 'javali', 'tucano', 'abelha',
  ],
  'Comida': [
    'lasanha', 'brigadeiro', 'feijoada', 'abacaxi', 'chocolate', 'panqueca',
    'melancia', 'pipoca', 'queijo', 'tapioca', 'mandioca', 'sorvete', 'macarrao',
    'pastel', 'goiaba', 'cuscuz', 'azeite', 'castanha', 'rabanada', 'pudim',
  ],
  'Objetos': [
    'tesoura', 'martelo', 'escova', 'chaveiro', 'travesseiro',
    'espelho', 'vassoura', 'lanterna', 'caderno', 'cadeira', 'relogio',
    'mochila', 'garfo', 'bussola', 'ventilador', 'cortina', 'pincel', 'aspirador',
  ],
  'Natureza': [
    'vulcao', 'cachoeira', 'deserto', 'floresta', 'relampago', 'caverna',
    'geleira', 'arvore', 'neblina', 'terremoto', 'orvalho', 'pantano',
    'duna', 'raiz', 'maré', 'furacao', 'ilha', 'nuvem',
  ],
  'Esportes': [
    'natacao', 'boliche', 'capoeira', 'ciclismo', 'handebol', 'esgrima',
    'surfe', 'maratona', 'volei', 'judo', 'escalada', 'patinacao',
    'remo', 'boxe', 'golfe', 'atletismo', 'arco', 'skate',
  ],
  'Profissões': [
    'padeiro', 'astronauta', 'bombeiro', 'dentista', 'veterinario', 'pedreiro',
    'jardineiro', 'piloto', 'costureira', 'eletricista', 'carteiro', 'arquiteto',
    'juiz', 'palhaco', 'pescador', 'cozinheiro', 'enfermeira', 'professor',
  ],
  'Lugares': [
    'aeroporto', 'biblioteca', 'mercado', 'castelo', 'farol', 'museu',
    'estadio', 'caverna', 'praia', 'hospital', 'teatro', 'fazenda',
    'ponte', 'porto', 'igreja', 'circo', 'parque', 'metro',
  ],
  'Transporte': [
    'bicicleta', 'helicoptero', 'submarino', 'carroca', 'foguete', 'caminhao',
    'balao', 'navio', 'trator', 'moto', 'canoa', 'teleferico',
    'trem', 'jangada', 'patinete', 'onibus', 'jipe', 'lancha',
  ],
  'Corpo humano': [
    'cotovelo', 'joelho', 'pulmao', 'cerebro', 'tornozelo', 'coracao',
    'sobrancelha', 'ombro', 'figado', 'polegar', 'garganta', 'cabelo',
    'costela', 'lingua', 'unha', 'barriga', 'calcanhar', 'punho',
  ],
  'Música': [
    'violao', 'bateria', 'sanfona', 'trompete', 'pandeiro', 'berimbau',
    'flauta', 'saxofone', 'teclado', 'cavaquinho', 'harpa', 'triangulo',
    'tambor', 'gaita', 'maracas', 'orquestra', 'coral', 'melodia',
  ],
  'Tecnologia': [
    'teclado', 'roteador', 'impressora', 'satelite', 'celular', 'bateria',
    'senha', 'cabo', 'drone', 'robo', 'antena', 'monitor',
    'chip', 'nuvem', 'aplicativo', 'servidor', 'camera', 'fone',
  ],
  'Cinema': [
    'titanic', 'matrix', 'avatar', 'gladiador', 'coringa', 'parasita',
    'interestelar', 'shrek', 'frozen', 'rocky', 'psicose', 'poltrona',
    'roteiro', 'figurino', 'oscar', 'bilheteria', 'trilha', 'cineasta',
    'legenda', 'estreia',
  ],
  'Futebol (times)': [
    'palmeiras', 'flamengo', 'corinthians', 'gremio', 'internacional', 'santos',
    'vasco', 'botafogo', 'fluminense', 'cruzeiro', 'bahia', 'fortaleza',
    'barcelona', 'liverpool', 'juventus', 'chelsea', 'arsenal', 'ajax',
    'milan', 'boca',
  ],
  'Games': [
    'minecraft', 'tetris', 'fortnite', 'pacman', 'sonic', 'pokemon',
    'roblox', 'zelda', 'mario', 'controle', 'joystick', 'fliperama',
    'checkpoint', 'chefao', 'arcade', 'lobby', 'skin', 'speedrun',
  ],
  'Séries e desenhos': [
    'friends', 'chernobyl', 'narcos', 'vikings', 'sherlock', 'simpsons',
    'chaves', 'pokemon', 'naruto', 'temporada', 'episodio', 'piloto',
    'maratonar', 'spoiler', 'elenco', 'reboot', 'dublagem', 'final',
  ],
  'Super-heróis': [
    'batman', 'superman', 'coringa', 'thanos', 'hulk', 'thor',
    'pantera', 'capa', 'mascara', 'vilao', 'poder', 'caverna',
    'quadrinho', 'multiverso', 'escudo', 'martelo', 'anel', 'mutante',
  ],
  'Países e cidades': [
    'japao', 'canada', 'egito', 'noruega', 'australia', 'marrocos',
    'portugal', 'islandia', 'jamaica', 'lisboa', 'tokyo', 'paris',
    'salvador', 'manaus', 'curitiba', 'recife', 'berlim', 'cairo',
  ],
  'Mitologia': [
    'medusa', 'minotauro', 'sereia', 'dragao', 'centauro', 'fenix',
    'saci', 'curupira', 'iara', 'lobisomem', 'oraculo', 'titan',
    'olimpo', 'raio', 'profecia', 'labirinto', 'ninfa', 'quimera',
  ],
  'Marcas': [
    'nintendo', 'ferrari', 'lego', 'adidas', 'nestle', 'havaianas',
    'natura', 'bombril', 'omo', 'ipanema', 'melissa', 'chevrolet',
    'yamaha', 'kibon', 'guarana', 'bauducco', 'tramontina', 'renner',
  ],
  'Roupas': [
    'cachecol', 'sandalia', 'jaqueta', 'chapeu', 'meia', 'vestido',
    'cinto', 'luva', 'blusa', 'bermuda', 'casaco', 'gravata',
    'bota', 'pijama', 'saia', 'tenis', 'touca', 'moletom',
  ],
};

function limpar(palavra) {
  return String(palavra)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Temas já normalizados: { tema: [palavras] }, só com palavras de 4+ letras. */
const BANCO = Object.fromEntries(
  Object.entries(TEMAS).map(([tema, palavras]) => [
    tema,
    [...new Set(palavras.map(limpar))].filter((p) => p.length >= 4),
  ]),
);

const NOMES_DOS_TEMAS = Object.keys(BANCO);

/** Mantém só os temas que existem no banco; lista vazia = todos os temas. */
function filtrarTemas(temas) {
  const escolhidos = (Array.isArray(temas) ? temas : []).filter((t) => NOMES_DOS_TEMAS.includes(t));
  return escolhidos.length ? [...new Set(escolhidos)] : NOMES_DOS_TEMAS;
}

/**
 * Sorteia um tema e uma palavra dele, evitando palavras já usadas na partida.
 * @param {Set<string>} usadas palavras já sorteadas
 * @param {() => number} aleatorio gerador (injetável nos testes)
 * @param {string[]} permitidos temas liberados na sala (vazio = todos)
 */
function sortear(usadas = new Set(), aleatorio = Math.random, permitidos = []) {
  const escolher = (lista) => lista[Math.floor(aleatorio() * lista.length)];
  const liberados = filtrarTemas(permitidos);
  const disponiveis = liberados.filter((tema) => BANCO[tema].some((p) => !usadas.has(p)));
  const temas = disponiveis.length ? disponiveis : liberados;
  const tema = escolher(temas);
  const restantes = BANCO[tema].filter((p) => !usadas.has(p));
  const palavra = escolher(restantes.length ? restantes : BANCO[tema]);
  return { tema, palavra };
}

module.exports = { BANCO, NOMES_DOS_TEMAS, sortear, filtrarTemas };
