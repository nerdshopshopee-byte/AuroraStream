// ============================================================
// AuroraStream — Catálogo de demonstração
// Usa streams HLS públicos e estáveis (Mux / Apple test streams)
// Posters vêm do picsum (com fallback de gradiente no cliente)
// ============================================================

import type { EpisodeItem, MediaItem } from './types'

const BBB = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
const APPLE_ADV =
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8'
const APPLE_16 =
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8'
const TOS = 'https://test-streams.mux.dev/tos_ismc/main.m3u8'
const PTS = 'https://test-streams.mux.dev/pts_shift/master.m3u8'
const TEST001 = 'https://test-streams.mux.dev/test_001/stream.m3u8'
const DAI = 'https://test-streams.mux.dev/dai-discontinuity-deltatre/manifest.m3u8'

function poster(seed: string) {
  return `https://picsum.photos/seed/aurora-${seed}/480/720`
}
function backdrop(seed: string) {
  return `https://picsum.photos/seed/aurora-${seed}/1600/900`
}

// ------------------------------------------------------------
// FILMES
// ------------------------------------------------------------
export const DEMO_MOVIES: MediaItem[] = [
  {
    id: 'd-mv-1',
    type: 'movie',
    source: 'demo',
    title: 'Big Buck Bunny',
    category: 'Animação',
    year: '2008',
    rating: 7.6,
    durationSec: 596,
    plot: 'Um coelho gigante e bondoso enfrenta três roedores valentões em uma floresta encantada. Clássico open-movie da Blender Foundation, referência mundial para testes de streaming.',
    poster: poster('bunny'),
    backdrop: backdrop('bunny'),
    streamUrl: BBB,
    ext: 'm3u8',
  },
  {
    id: 'd-mv-2',
    type: 'movie',
    source: 'demo',
    title: 'Tears of Steel',
    category: 'Ficção Científica',
    year: '2012',
    rating: 7.2,
    durationSec: 734,
    plot: 'Em um Amsterdã futurista, um grupo de guerreiros e cientistas tenta salvar o mundo dos robôs recriando o passado. Curta-metragem open-source com efeitos visuais premiados.',
    poster: poster('steel'),
    backdrop: backdrop('steel'),
    streamUrl: TOS,
    ext: 'm3u8',
  },
  {
    id: 'd-mv-3',
    type: 'movie',
    source: 'demo',
    title: 'Sintel — A Caçada do Dragão',
    category: 'Fantasia',
    year: '2010',
    rating: 8.1,
    durationSec: 888,
    plot: 'Uma jovem solitária atravessa terras hostis em busca do filhote de dragão que ela salvou e criou. Uma jornada épica sobre amizade, perda e tempo.',
    poster: poster('sintel'),
    backdrop: backdrop('sintel'),
    streamUrl: PTS,
    ext: 'm3u8',
  },
  {
    id: 'd-mv-4',
    type: 'movie',
    source: 'demo',
    title: 'Aurora: Origem',
    category: 'Ação',
    year: '2024',
    rating: 6.9,
    durationSec: 615,
    plot: 'Quando a rede neural global colapsa, uma hackeadora descobre que a verdadeira ameaça vem de dentro da própria estação orbital Aurora.',
    poster: poster('aurora'),
    backdrop: backdrop('aurora'),
    streamUrl: TEST001,
    ext: 'm3u8',
  },
  {
    id: 'd-mv-5',
    type: 'movie',
    source: 'demo',
    title: 'Códigos do Amanhã',
    category: 'Suspense',
    year: '2023',
    rating: 7.4,
    durationSec: 540,
    plot: 'Um programador descobre um algoritmo capaz de prever crimes — mas cada execução custa uma memória sua.',
    poster: poster('codes'),
    backdrop: backdrop('codes'),
    streamUrl: DAI,
    ext: 'm3u8',
  },
  {
    id: 'd-mv-6',
    type: 'movie',
    source: 'demo',
    title: 'O Guardião da Bola',
    category: 'Esporte / Drama',
    year: '2022',
    rating: 7.8,
    durationSec: 660,
    plot: 'Um ex-goleiro de garagem treina um time de favela rumo ao campeonato estadual, confrontando o fantasma da final que perdeu há vinte anos.',
    poster: poster('keeper'),
    backdrop: backdrop('keeper'),
    streamUrl: APPLE_16,
    ext: 'm3u8',
  },
  {
    id: 'd-mv-7',
    type: 'movie',
    source: 'demo',
    title: 'Vidro e Neve',
    category: 'Drama',
    year: '2021',
    rating: 6.5,
    durationSec: 594,
    plot: 'Duas irmãs voltam à casa de infância nos Alpes para vender o imóvel e encontram cartas que reescrevem toda a história da família.',
    poster: poster('glass'),
    backdrop: backdrop('glass'),
    streamUrl: BBB,
    ext: 'm3u8',
  },
  {
    id: 'd-mv-8',
    type: 'movie',
    source: 'demo',
    title: 'Missão: Órbita Zero',
    category: 'Ficção / Ação',
    year: '2025',
    rating: 7.1,
    durationSec: 702,
    plot: 'A primeira missão tripulada a Marte perde contato com a Terra a 90 dias do pouso. Sobreviver significa confiar em quem mentiu.',
    poster: poster('orbit'),
    backdrop: backdrop('orbit'),
    streamUrl: APPLE_ADV,
    ext: 'm3u8',
  },
]

// ------------------------------------------------------------
// SÉRIES
// ------------------------------------------------------------
function episodesFor(
  seriesId: string,
  titles: [string, string][],
  streams: string[],
): EpisodeItem[] {
  return titles.map(([title, plot], i) => ({
    id: `${seriesId}-e${i + 1}`,
    season: 1,
    num: i + 1,
    title,
    plot,
    durationSec: 480 + i * 45,
    streamUrl: streams[i % streams.length],
    ext: 'm3u8',
  }))
}

const S1_PLOTS = [
  'O despertar antecipado revela a primeira anomalia a bordo.',
  'A equipe encontra outra estação idêntica à deles, vazia.',
  'Uma falha no casco esconde uma mensagem da Terra.',
  'O passado da comandante ameaça a missão de resgate.',
  'Transmissões antigas mostram o que aconteceu há 12 meses.',
  'A resposta final muda tudo — e todos.',
]

const S1 = [
  'Piloto — Sinal Perdido',
  'A Estação Fantasma',
  'Buraco Negro de Verão',
  'Os Herdeiros do Silêncio',
  'Ruído Branco',
  'Final — Aurora',
]

export const DEMO_SERIES: MediaItem[] = [
  {
    id: 'd-sr-1',
    type: 'series',
    source: 'demo',
    title: 'Constelação Aurora',
    category: 'Série Sci-Fi',
    year: '2024',
    rating: 8.4,
    plot: 'A tripulação da estação Aurora acorda do hipersono um ano antes do previsto e descobre que a Terra está em silêncio absoluto. Seis episódios de suspense espacial.',
    poster: poster('constellation'),
    backdrop: backdrop('constellation'),
  },
  {
    id: 'd-sr-2',
    type: 'series',
    source: 'demo',
    title: 'Zona de Concreto',
    category: 'Série Policial',
    year: '2023',
    rating: 7.9,
    plot: 'Dois delegados rivais precisam dividir a mesma sala para desmontar a maior quadrilha de roubo de cargas do país.',
    poster: poster('concrete'),
    backdrop: backdrop('concrete'),
  },
  {
    id: 'd-sr-3',
    type: 'series',
    source: 'demo',
    title: 'Reinos de Vidro',
    category: 'Série Fantasia',
    year: '2025',
    rating: 8.7,
    plot: 'Em um continente onde a magia custa memória, uma aprendiz de vidraceiro descobre que é a herdeira do trono esquecido.',
    poster: poster('kingdoms'),
    backdrop: backdrop('kingdoms'),
  },
]

export const DEMO_SERIES_EPISODES: Record<string, EpisodeItem[]> = {
  'd-sr-1': episodesFor(
    'd-sr-1',
    S1.map((title, i) => [title, S1_PLOTS[i]] as [string, string]),
    [TOS, BBB, PTS, APPLE_16, TEST001, TOS],
  ),
  'd-sr-2': episodesFor(
    'd-sr-2',
    [
      ['O Carga', 'Um caminhão some com 4 toneladas de eletrônicos.'],
      ['Alinhamento', 'Os dois delegados são forçados a dividir o caso.'],
      ['A Boate', 'A pista leva ao submundo do porto.'],
      ['Rastros de Areia', 'O dinheiro aponta para fora do país.'],
      ['Cerca Eletrificada', 'A operação noturna dá terrivelmente certo.'],
      ['Concreto Armado', 'A quadrilha responde — dentro da própria delegacia.'],
    ],
    [TEST001, DAI, PTS, APPLE_16, BBB, APPLE_ADV],
  ),
  'd-sr-3': episodesFor(
    'd-sr-3',
    [
      ['A Oficina', 'A aprendiz conserta um espelho que mostra o futuro.'],
      ['O Tribunal de Vidro', 'Uma acusação antiga atinge sua família.'],
      ['Marcha das Cinzas', 'O reino esquecido chama seus herdeiros.'],
      ['Preço da Memória', 'Para salvar um amigo, ela precisa esquecê-lo.'],
      ['O Trono Vazio', 'A coroa aceita quem sobreviver à forja.'],
      ['Coroação', 'O vidro estilhaça — e o reino renasce.'],
    ],
    [APPLE_ADV, PTS, BBB, TOS, APPLE_16, DAI],
  ),
}

// ------------------------------------------------------------
// TV AO VIVO / ESPORTES
// ------------------------------------------------------------
export const DEMO_LIVE: MediaItem[] = [
  {
    id: 'd-lv-1',
    type: 'live',
    source: 'demo',
    title: 'Aurora Sport HD',
    category: 'Esportes',
    plot: 'Futebol ao vivo, mesa-redonda e melhores momentos 24 horas.',
    streamUrl: DAI,
    ext: 'm3u8',
  },
  {
    id: 'd-lv-2',
    type: 'live',
    source: 'demo',
    title: 'Arena Futebol Brasil',
    category: 'Esportes',
    plot: 'Campeonatos nacionais e internacionais com transmissão contínua.',
    streamUrl: PTS,
    ext: 'm3u8',
  },
  {
    id: 'd-lv-3',
    type: 'live',
    source: 'demo',
    title: 'Aurora Cine 4K',
    category: 'Filmes',
    plot: 'Maratona de cinema sem intervalos.',
    streamUrl: TOS,
    ext: 'm3u8',
  },
  {
    id: 'd-lv-4',
    type: 'live',
    source: 'demo',
    title: 'Aurora News World',
    category: 'Notícias',
    plot: 'Jornalismo internacional em tempo real.',
    streamUrl: APPLE_ADV,
    ext: 'm3u8',
  },
  {
    id: 'd-lv-5',
    type: 'live',
    source: 'demo',
    title: 'MegaFilmes HD',
    category: 'Filmes',
    plot: 'Os grandes clássicos do cinema, sem parar.',
    streamUrl: BBB,
    ext: 'm3u8',
  },
  {
    id: 'd-lv-6',
    type: 'live',
    source: 'demo',
    title: 'Série Channel',
    category: 'Séries',
    plot: 'Maratonas das séries do momento.',
    streamUrl: APPLE_16,
    ext: 'm3u8',
  },
  {
    id: 'd-lv-7',
    type: 'live',
    source: 'demo',
    title: 'Aurora Kids',
    category: 'Infantil',
    plot: 'Desenhos e diversão para a família.',
    streamUrl: TEST001,
    ext: 'm3u8',
  },
  {
    id: 'd-lv-8',
    type: 'live',
    source: 'demo',
    title: 'Esporte Interativo+',
    category: 'Esportes',
    plot: 'Multi-camadas, estatísticas e narração alternativa.',
    streamUrl: DAI,
    ext: 'm3u8',
  },
  {
    id: 'd-lv-18',
    type: 'live',
    source: 'demo',
    title: 'Venus Premium HD',
    category: 'Adultos +18',
    plot: 'Canal de conteúdo adulto — protegido pelo controle parental.',
    streamUrl: TEST001,
    ext: 'm3u8',
  },
]

export interface Fixture {
  id: string
  time: string
  competition: string
  home: string
  away: string
  channel: string
  channelId: string
}

export function demoFixtures(): Fixture[] {
  const now = new Date()
  const fmt = (h: number, min = 0) => {
    const d = new Date(now)
    d.setHours(h, min, 0, 0)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  return [
    {
      id: 'fx-1',
      time: fmt(16),
      competition: 'Brasileirão Série A',
      home: 'Flamengo',
      away: 'Palmeiras',
      channel: 'Aurora Sport HD',
      channelId: 'd-lv-1',
    },
    {
      id: 'fx-2',
      time: fmt(18, 30),
      competition: 'Libertadores',
      home: 'Corinthians',
      away: 'River Plate',
      channel: 'Arena Futebol Brasil',
      channelId: 'd-lv-2',
    },
    {
      id: 'fx-3',
      time: fmt(20, 45),
      competition: 'Premier League',
      home: 'Manchester City',
      away: 'Arsenal',
      channel: 'Esporte Interativo+',
      channelId: 'd-lv-8',
    },
    {
      id: 'fx-4',
      time: fmt(21, 30),
      competition: 'La Liga',
      home: 'Real Madrid',
      away: 'Barcelona',
      channel: 'Aurora Sport HD',
      channelId: 'd-lv-1',
    },
  ]
}

export const DEMO_BACKDROP_ART = backdrop('hero-main')

// ------------------------------------------------------------
// Carimbo de "adicionado em" (xtream-recently-added)
// distribuição determinística: alguns hoje, outros há semanas
// ------------------------------------------------------------
const DAY = 86_400_000
function stampAdded(items: MediaItem[], days: number[]) {
  items.forEach((it, i) => {
    it.addedAt = Date.now() - days[i % days.length] * DAY
  })
}
stampAdded(DEMO_MOVIES, [0.1, 4, 12, 1.5, 0.4, 30, 8, 2])
stampAdded(DEMO_SERIES, [0.2, 6, 1])
stampAdded(DEMO_LIVE, [0.3, 15, 3, 0.1, 21, 7, 40, 0.5])
