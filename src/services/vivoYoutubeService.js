/**
 * Transmisiones en vivo de canales de YouTube, para Overtime TV.
 *
 * Cómo se detecta, por canal de YouTube (sin gastar cuota de más):
 *  1. El feed RSS público del canal (`feeds/videos.xml?channel_id=…`, gratis, sin cuota) trae
 *     sus últimos ~15 videos; un vivo en curso aparece ahí.
 *  2. Con `YOUTUBE_API_KEY`: UNA llamada a `videos.list` (1 unidad cada 50 videos, todos los
 *     canales juntos) dice cuáles están `live` ahora. Encuentra varias transmisiones
 *     simultáneas del mismo canal.
 *  3. Sin key: la página `/channel/<id>/live`, que sólo muestra la transmisión principal.
 *
 * Nunca se le pregunta a YouTube por visita: cada canal se consulta como mucho una vez cada
 * `TTL_MS` y las consultas simultáneas comparten la misma promesa.
 */

const TTL_MS = 1000 * 60 * 3;
const UA = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es' };
const RX_CANAL = /^UC[\w-]{22}$/;

const cache = new Map(); // channelId -> { vivos, vence }
const enCurso = new Map(); // channelId -> Promise

/** Ids de video del feed RSS de un canal. Puro. */
export const idsDelFeed = (xml) => [...String(xml || '').matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)].map((m) => m[1]);

/** De la respuesta de `videos.list`, los que están en vivo ahora y se pueden embeber. Puro. */
export const vivosDeVideosList = (json) =>
  (json?.items || [])
    .filter((v) => v.snippet?.liveBroadcastContent === 'live' && v.status?.embeddable !== false)
    .map((v) => ({
      videoId: v.id,
      channelId: v.snippet.channelId,
      titulo: v.snippet.title || '',
      canalYoutube: v.snippet.channelTitle || '',
      desde: v.liveStreamingDetails?.actualStartTime || null,
      espectadores: v.liveStreamingDetails?.concurrentViewers ? Number(v.liveStreamingDetails.concurrentViewers) : null,
    }));

/** De la página `/live` de un canal: el vivo en curso, si hay. Puro. */
/** El objeto JSON que empieza en `desde` (una `{`), contando llaves fuera de strings. Puro. */
const objetoJson = (texto, desde) => {
  let nivel = 0;
  let enString = false;
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i];
    if (enString) {
      if (c === '\\') i++;
      else if (c === '"') enString = false;
    } else if (c === '"') enString = true;
    else if (c === '{') nivel++;
    else if (c === '}' && --nivel === 0) {
      try { return JSON.parse(texto.slice(desde, i + 1)); } catch { return null; }
    }
  }
  return null;
};

export const vivoDePaginaLive = (html, channelId) => {
  // Sólo el video principal de la página (`videoDetails`): los recomendados traen sus propias marcas.
  const texto = String(html || '');
  const i = texto.indexOf('"videoDetails":{');
  if (i < 0) return null;
  const d = objetoJson(texto, i + '"videoDetails":'.length);
  if (!d?.videoId || !(d.isLive || d.isLiveNow)) return null;
  return { videoId: d.videoId, channelId, titulo: d.title || '', canalYoutube: d.author || '', desde: null, espectadores: null };
};

/**
 * Lo que pegó el admin (link del canal, @handle o id) → { channelId?, handle?, url? }. Puro.
 */
export const leerReferenciaCanal = (input) => {
  const s = String(input || '').trim();
  if (RX_CANAL.test(s)) return { channelId: s };
  if (/^@[\w.-]+$/.test(s)) return { handle: s };
  let url;
  try {
    url = new URL(s.startsWith('http') ? s : `https://${s}`);
  } catch {
    return {};
  }
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return {};
  const partes = url.pathname.split('/').filter(Boolean);
  if (partes[0] === 'channel' && RX_CANAL.test(partes[1] || '')) return { channelId: partes[1] };
  if (partes[0]?.startsWith('@')) return { handle: partes[0] };
  if (partes.length) return { url: `https://www.youtube.com/${partes.slice(0, 2).join('/')}` };
  return {};
};

/** Resuelve un canal de YouTube a { channelId, nombre }. Lanza con status 400 si no se puede. */
export async function resolverCanalYoutube(input) {
  const ref = leerReferenciaCanal(input);
  const key = process.env.YOUTUBE_API_KEY;
  if (!ref.channelId && !ref.handle && !ref.url) {
    throw Object.assign(new Error('No reconozco ese canal: pegá el link del canal (youtube.com/@…) o su id (UC…)'), { status: 400 });
  }
  if (key && (ref.channelId || ref.handle)) {
    const q = ref.channelId ? `id=${ref.channelId}` : `forHandle=${encodeURIComponent(ref.handle)}`;
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&${q}&key=${key}`);
    if (res.ok) {
      const c = (await res.json()).items?.[0];
      if (c) return { channelId: c.id, nombre: c.snippet?.title || '' };
    }
  }
  const pagina = ref.channelId ? `https://www.youtube.com/channel/${ref.channelId}` : ref.handle ? `https://www.youtube.com/${ref.handle}` : ref.url;
  const res = await fetch(pagina, { headers: UA });
  if (!res.ok) throw Object.assign(new Error('YouTube no encontró ese canal'), { status: 400 });
  const html = await res.text();
  const id = ref.channelId || html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] || html.match(/channel\/(UC[\w-]{22})/)?.[1];
  if (!id) throw Object.assign(new Error('No pude leer el id del canal'), { status: 400 });
  const nombre = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] || '';
  return { channelId: id, nombre };
}

const porFeed = async (channelId) => {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { headers: UA });
  if (!res.ok) throw new Error(`feed ${res.status}`);
  return idsDelFeed(await res.text());
};

const porPaginaLive = async (channelId) => {
  const res = await fetch(`https://www.youtube.com/channel/${channelId}/live`, { headers: UA });
  if (!res.ok) return [];
  const v = vivoDePaginaLive(await res.text(), channelId);
  return v ? [v] : [];
};

/** Consulta a YouTube los canales pedidos (sin cache). → Map channelId → vivos[] */
async function consultar(channelIds) {
  const out = new Map(channelIds.map((id) => [id, []]));
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    await Promise.all(channelIds.map(async (id) => out.set(id, await porPaginaLive(id).catch(() => []))));
    return out;
  }
  const feeds = await Promise.all(channelIds.map((id) => porFeed(id).catch(() => [])));
  const ids = [...new Set(feeds.flat())];
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails,status&id=${lote.join(',')}&key=${key}`,
    );
    if (!res.ok) throw new Error(`YouTube Data API ${res.status}`);
    for (const v of vivosDeVideosList(await res.json())) {
      if (out.has(v.channelId)) out.get(v.channelId).push(v);
    }
  }
  return out;
}

/**
 * Vivos en curso de esos canales de YouTube, con cache. Un canal que falla devuelve [] (y se
 * reintenta en el próximo ciclo): un error de YouTube nunca rompe la TV.
 * → Map channelId → [{ videoId, channelId, titulo, canalYoutube, desde, espectadores }]
 */
export async function vivosDeCanales(channelIds) {
  const unicos = [...new Set(channelIds)].filter((id) => RX_CANAL.test(id));
  const ahora = Date.now();
  const faltan = unicos.filter((id) => !(cache.get(id)?.vence > ahora) && !enCurso.has(id));
  if (faltan.length) {
    const p = consultar(faltan)
      .then((m) => {
        for (const [id, vivos] of m) cache.set(id, { vivos, vence: Date.now() + TTL_MS });
      })
      .catch((e) => {
        console.error('[tv/vivo] no se pudo consultar YouTube:', e.message);
        for (const id of faltan) cache.set(id, { vivos: cache.get(id)?.vivos ?? [], vence: Date.now() + TTL_MS });
      })
      .finally(() => faltan.forEach((id) => enCurso.delete(id)));
    faltan.forEach((id) => enCurso.set(id, p));
  }
  await Promise.all(unicos.map((id) => enCurso.get(id)).filter(Boolean));
  return new Map(unicos.map((id) => [id, cache.get(id)?.vivos ?? []]));
}

export const __test = { cache, enCurso };
