/**
 * Videos subidos por un canal de YouTube, para elegir cuáles importar al catálogo.
 *
 *  - Con `YOUTUBE_API_KEY`: la lista de subidas del canal (`UU…`), de a 50 y paginada
 *    (1 unidad de cuota por página): llega a todo el historial.
 *  - Sin key: el feed RSS público, que trae sólo los últimos ~15.
 */

const UA = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es' };

const desescapar = (s) =>
  String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** Entradas del feed RSS de un canal → [{ youtubeId, titulo, publicado }]. Puro. */
export const videosDelFeed = (xml) =>
  [...String(xml || '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map(([, e]) => ({
      youtubeId: e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1],
      titulo: desescapar(e.match(/<title>([\s\S]*?)<\/title>/)?.[1]),
      publicado: e.match(/<published>([^<]+)<\/published>/)?.[1] || null,
    }))
    .filter((v) => v.youtubeId);

/** Respuesta de playlistItems → [{ youtubeId, titulo, publicado }]. Puro. */
export const videosDePlaylist = (json) =>
  (json?.items || [])
    .map((it) => ({
      youtubeId: it.snippet?.resourceId?.videoId || it.contentDetails?.videoId,
      titulo: it.snippet?.title || '',
      publicado: it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt || null,
    }))
    .filter((v) => v.youtubeId && v.titulo !== 'Private video' && v.titulo !== 'Deleted video');

/** → { items: [{ youtubeId, titulo, publicado }], siguiente: pageToken|null, completo: boolean } */
export async function listarVideosCanal(channelId, pageToken = null) {
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    const lista = `UU${channelId.slice(2)}`;
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${lista}&key=${key}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw Object.assign(new Error(`YouTube respondió ${res.status}`), { status: 502 });
    const json = await res.json();
    return { items: videosDePlaylist(json), siguiente: json.nextPageToken || null, completo: true };
  }
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { headers: UA });
  if (!res.ok) throw Object.assign(new Error(`YouTube respondió ${res.status}`), { status: 502 });
  return { items: videosDelFeed(await res.text()), siguiente: null, completo: false };
}
