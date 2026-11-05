'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, Check, Clapperboard, Loader2, Play, Star, Tv, Users, Video, X, Youtube } from 'lucide-react'
import { useAurora } from '@/lib/store'
import { loadSeriesInfo, loadVodInfo } from '@/lib/client'
import type { EpisodeItem, SeriesDetail, VodInfo } from '@/lib/types'
import { mediaKey } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Poster } from './Poster'
import { toast } from 'sonner'

/**
 * Overlay de detalhes (vod-details): ficha completa com backdrop, elenco,
 * direção, trailer, títulos semelhantes + temporadas/episódios para séries,
 * guia (EPG) para canais ao vivo, com retomada e favoritos.
 */
export function DetailsOverlay() {
  const overlay = useAurora((s) => s.overlay)
  const closeOverlay = useAurora((s) => s.closeOverlay)
  const openDetails = useAurora((s) => s.openDetails)
  const openEpg = useAurora((s) => s.openEpg)
  const play = useAurora((s) => s.play)
  const toggleFavorite = useAurora((s) => s.toggleFavorite)
  const favorites = useAurora((s) => s.favorites)
  const progress = useAurora((s) => s.progress)
  const catalog = useAurora((s) => s.catalog)
  const item = overlay?.kind === 'details' ? overlay.item : null

  const [detail, setDetail] = useState<SeriesDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [season, setSeason] = useState<number | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [vod, setVod] = useState<VodInfo | null>(null)
  const [loadingVod, setLoadingVod] = useState(false)
  const [vodFor, setVodFor] = useState<string | null>(null)

  const itemId = item?.id ?? null
  const isSeries = item?.type === 'series'
  const isMovie = item?.type === 'movie'
  const isLive = item?.type === 'live'
  if (isSeries && itemId && loadedFor !== itemId) {
    setLoadedFor(itemId)
    setDetail(null)
    setLoading(true)
    setSeason(null)
  }
  if (isMovie && itemId && vodFor !== itemId) {
    setVodFor(itemId)
    setVod(null)
    setLoadingVod(true)
  }

  useEffect(() => {
    if (!item || item.type !== 'series' || loadedFor !== item.id) return
    let alive = true
    loadSeriesInfo(item, item.source)
      .then((d) => {
        if (!alive) return
        setDetail(d)
        // abre na temporada com progresso pendente ou a primeira
        const pr = progress.find((p) => p.mediaId === item.id)
        const seasons = d.seasons.length ? d.seasons : [1]
        setSeason(pr?.season && seasons.includes(pr.season) ? pr.season : seasons[0])
      })
      .catch((e) => {
        if (alive) toast.error('Erro ao carregar detalhes', { description: e.message })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [item, loadedFor, progress])

  // vod-details: enriquece a ficha do filme (elenco, direção, trailer…)
  useEffect(() => {
    if (!item || item.type !== 'movie' || vodFor !== item.id) return
    let alive = true
    loadVodInfo(item)
      .then((info) => {
        if (alive) setVod(info)
      })
      .catch(() => {
        /* mantém a ficha básica */
      })
      .finally(() => {
        if (alive) setLoadingVod(false)
      })
    return () => {
      alive = false
    }
  }, [item, vodFor])

  const isFav = item ? favorites.some((f) => mediaKey(f.mediaType, f.mediaId) === mediaKey(item.type, item.id)) : false

  // retomada de filmes
  const movieProgress = useMemo(() => {
    if (!item || item.type !== 'movie') return null
    return progress.find((p) => p.mediaId === item.id) ?? null
  }, [progress, item])
  const resumePct =
    movieProgress && movieProgress.durationSec > 0
      ? (movieProgress.positionSec / movieProgress.durationSec) * 100
      : 0
  const canResume = resumePct > 5 && resumePct < 95

  // títulos semelhantes: mesma categoria, melhor avaliados primeiro
  const similar = useMemo(() => {
    if (!item || !catalog) return []
    const pool =
      item.type === 'movie' ? catalog.movies : item.type === 'series' ? catalog.series : []
    const same = pool.filter(
      (i) => i.id !== item.id && (i.category ?? '') === (item.category ?? ''),
    )
    const source = same.length >= 4 ? same : pool.filter((i) => i.id !== item.id && i.type === item.type)
    return [...source].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 12)
  }, [catalog, item])

  const episodes: EpisodeItem[] = useMemo(() => {
    if (!detail || season == null) return []
    const list = detail.episodes?.[season]
    return Array.isArray(list) ? list : []
  }, [detail, season])

  if (!item) return null

  const backdrop = isMovie ? (vod?.backdrop ?? item.backdrop) : item.backdrop

  const episodeProgress = new Map<number, (typeof progress)[number]>()
  if (item.type === 'series') {
    for (const p of progress) {
      if (p.mediaId === item.id && p.episode != null) episodeProgress.set(p.episode, p)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={closeOverlay}
    >
      <motion.div
        initial={{ scale: 0.94, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl shadow-2xl shadow-black/70"
      >
        <button
          onClick={closeOverlay}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-lg bg-black/40 text-white/70 backdrop-blur transition-all hover:bg-white/15 hover:text-white"
          aria-label="Fechar"
        >
          <X size={17} />
        </button>

        {/* ---------- backdrop (vod-details) ---------- */}
        {backdrop && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-44 overflow-hidden opacity-40">
            <img src={backdrop} alt="" className="h-full w-full object-cover" draggable={false} />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#101620]/60 to-[#101620]" />
          </div>
        )}

        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6 pt-10 md:flex-row aurora-scroll">
          {/* Capa */}
          <div className="shrink-0 self-center md:self-start">
            <Poster
              item={item}
              iconSize={48}
              className="aspect-[2/3] w-40 rounded-2xl shadow-xl ring-1 ring-white/15 md:w-52"
            />
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
              {vod?.genre || item.category || (item.type === 'series' ? 'Série' : isLive ? 'Ao vivo' : 'Filme')}
            </p>
            <h2 className="mt-1 text-2xl font-black text-white md:text-3xl">{item.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/55">
              {item.year && <span>{item.year}</span>}
              {item.rating != null && item.rating > 0 && (
                <span className="flex items-center gap-1 text-amber-300">
                  <Star size={12} className="fill-amber-300" /> {item.rating.toFixed(1)}
                </span>
              )}
              {item.durationSec ? <span>{Math.round(item.durationSec / 60)} min</span> : null}
              {vod?.country && <span>{vod.country}</span>}
              <span className="uppercase tracking-wider">{item.source === 'demo' ? 'Demonstração' : 'Xtream'}</span>
            </div>

            {item.plot && (
              <p className="mt-3 max-h-28 overflow-y-auto text-sm leading-relaxed text-white/65 aurora-scroll">
                {vod?.plot ?? item.plot}
              </p>
            )}

            {/* elenco + direção (vod-details) */}
            {(vod?.cast || vod?.director || loadingVod) && (
              <div className="mt-3 space-y-1 text-xs text-white/45">
                {vod?.cast && (
                  <p className="flex items-start gap-1.5">
                    <Users size={12} className="mt-0.5 shrink-0 text-white/30" />
                    <span>
                      <span className="font-bold text-white/60">Elenco: </span>
                      {vod.cast}
                    </span>
                  </p>
                )}
                {vod?.director && (
                  <p className="flex items-start gap-1.5">
                    <Clapperboard size={12} className="mt-0.5 shrink-0 text-white/30" />
                    <span>
                      <span className="font-bold text-white/60">Direção: </span>
                      {vod.director}
                    </span>
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2.5">
              {item.type !== 'series' && (
                <button
                  onClick={() => play(item, null, canResume ? movieProgress?.positionSec ?? 0 : 0)}
                  className="flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-6 font-bold text-black transition-all hover:bg-emerald-400 active:scale-95"
                >
                  <Play size={17} className="fill-black" />
                  {canResume ? `Continuar ${Math.round(resumePct)}%` : 'Reproduzir'}
                </button>
              )}
              {canResume && (
                <span className="flex h-11 items-center" title="Progresso">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                    <span className="block h-full bg-emerald-400" style={{ width: `${resumePct}%` }} />
                  </span>
                </span>
              )}
              {/* guia de programação para canais ao vivo */}
              {isLive && (
                <button
                  onClick={() => openEpg(item.id)}
                  className="glass flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white/85 transition-all active:scale-95 hover:bg-white/12"
                >
                  <CalendarClock size={16} className="text-emerald-300" />
                  Guia (EPG)
                </button>
              )}
              {/* trailer do YouTube (vod-details) */}
              {isMovie && vod?.youtubeTrailer && (
                <a
                  href={
                    vod.youtubeTrailer.startsWith('http')
                      ? vod.youtubeTrailer
                      : `https://www.youtube.com/watch?v=${vod.youtubeTrailer}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="glass flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white/85 transition-all active:scale-95 hover:bg-white/12"
                >
                  <Youtube size={16} className="text-red-400" />
                  Trailer
                </a>
              )}
              <button
                onClick={() =>
                  toggleFavorite(item).then((fav) =>
                    toast(fav ? 'Adicionado aos favoritos' : 'Removido dos favoritos', {
                      description: item.title,
                    }),
                  )
                }
                className={cn(
                  'glass flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold transition-all active:scale-95',
                  isFav ? 'text-emerald-300' : 'text-white/85',
                )}
              >
                {isFav ? <Check size={16} /> : null}
                {isFav ? 'Nos favoritos' : 'Adicionar aos favoritos'}
              </button>
            </div>

            {/* ---------- SÉRIES: temporadas + episódios ---------- */}
            {item.type === 'series' && (
              <div className="mt-5">
                {loading ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-white/50">
                    <Loader2 size={16} className="animate-spin" /> Carregando episódios…
                  </div>
                ) : detail && detail.seasons.length > 0 ? (
                  <>
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {detail.seasons.map((s) => (
                        <button
                          key={s}
                          onClick={() => setSeason(s)}
                          className={cn(
                            'rounded-full px-3.5 py-1.5 text-xs font-bold transition-all',
                            season === s
                              ? 'bg-emerald-500 text-black'
                              : 'bg-white/8 text-white/60 hover:bg-white/15',
                          )}
                        >
                          Temporada {s}
                        </button>
                      ))}
                    </div>
                    <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1 aurora-scroll">
                      {episodes.map((ep) => {
                        const pr = episodeProgress.get(ep.num)
                        const pct = pr && pr.durationSec > 0 ? (pr.positionSec / pr.durationSec) * 100 : 0
                        const watched = pct > 90
                        return (
                          <button
                            key={ep.id}
                            onClick={() => play(item, ep, pct > 5 && pct < 95 ? (pr?.positionSec ?? 0) : 0)}
                            className="group flex w-full items-center gap-3 rounded-xl bg-white/[0.04] p-2.5 text-left ring-1 ring-white/8 transition-all hover:bg-white/10 hover:ring-emerald-400/30"
                          >
                            <span
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold',
                                watched ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/8 text-white/60',
                              )}
                            >
                              {watched ? <Check size={15} /> : ep.num}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-white/90">
                                {ep.title}
                              </span>
                              {ep.plot && (
                                <span className="mt-0.5 block truncate text-xs text-white/40">
                                  {ep.plot}
                                </span>
                              )}
                              {pct > 0 && pct < 95 && (
                                <span className="mt-1 block h-1 w-28 overflow-hidden rounded-full bg-white/10">
                                  <span className="block h-full bg-emerald-400" style={{ width: `${pct}%` }} />
                                </span>
                              )}
                            </span>
                            {ep.durationSec ? (
                              <span className="shrink-0 font-mono text-[11px] text-white/35">
                                {Math.round(ep.durationSec / 60)} min
                              </span>
                            ) : null}
                            <Play size={14} className="shrink-0 text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100" />
                          </button>
                        )
                      })}
                      {episodes.length === 0 && (
                        <p className="py-6 text-center text-sm text-white/40">
                          Nenhum episódio nesta temporada.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="py-6 text-sm text-white/45">
                    Nenhum episódio disponível para esta série no servidor.
                  </p>
                )}
              </div>
            )}

            {/* ---------- TÍTULOS SEMELHANTES (vod-details) ---------- */}
            {similar.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-white/35">
                  {isLive ? <Tv size={11} /> : <Video size={11} />} Semelhantes
                </p>
                <div className="flex gap-2.5 overflow-x-auto pb-2 aurora-scroll">
                  {similar.map((s) => (
                    <button
                      key={`${s.type}-${s.id}`}
                      onClick={() => openDetails(s)}
                      className="group shrink-0 transition-transform duration-300 hover:-translate-y-1.5"
                      title={s.title}
                    >
                      <span className="block h-28 w-[74px] overflow-hidden rounded-lg ring-1 ring-white/10 transition-all group-hover:ring-2 group-hover:ring-emerald-400 md:h-32 md:w-[86px]">
                        <Poster item={s} className="h-full w-full" iconSize={20} />
                      </span>
                      <span className="mt-1 block w-[74px] truncate text-[9px] font-bold text-white/45 md:w-[86px]">
                        {s.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
