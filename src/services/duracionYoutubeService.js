/**
 * Duración (en segundos) de videos de YouTube, para armar la grilla de Overtime TV.
 *
 * La programación es la misma para todos según el reloj, así que hay que saber cuánto dura
 * cada video ANTES de reproducirlo. Dos fuentes:
 *  1. YouTube Data API v3 (si hay `YOUTUBE_API_KEY`): oficial, 50 videos por llamada.
 *  2. Sin key: leer `lengthSeconds` de la página pública del video. Funciona, pero YouTube
 *     puede cortarlo desde IPs de datacenter; por eso la key es lo recomendado en producción.
 *
 * Cache en memoria por videoId (si cambia el link, cambia el ID y se vuelve a pedir). Un video
 * privado o borrado devuelve null y queda cacheado como tal por un rato: así la TV no lo
 * programa, en vez de mostrar una pantalla negra.
 */

const TTL_OK = 1000 * 60 * 60 * 24 * 7;
const TTL_FALLO = 1000 * 60 * 60;
const cache = new Map(); // videoId -> { duracion: number|null, vence: number }

const leerCache = (id) => {
  const c = cache.get(id);
  return c && c.vence > Date.now() ? c : null;
};

const guardar = (id, duracion) =>
  cache.set(id, { duracion, vence: Date.now() + (duracion ? TTL_OK : TTL_FALLO) });

/** ISO 8601 de la Data API (PT1H15M11S) a segundos. */
const isoASegundos = (iso) => {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  const s = (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
  return s > 0 ? s : null;
};

const porDataApi = async (ids, key) => {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${ids.join(',')}&key=${key}`,
  );
  if (!res.ok) throw new Error(`YouTube Data API ${res.status}`);
  const json = await res.json();
  const out = new Map(ids.map((id) => [id, null]));
  for (const v of json.items || []) {
    if (v.status?.embeddable === false) continue;
    out.set(v.id, isoASegundos(v.contentDetails?.duration));
  }
  return out;
};

const porPagina = async (id) => {
  const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  // Sólo el bloque del video pedido: la página trae otras duraciones (recomendados).
  const bloque = html.match(new RegExp(`"videoDetails":\\{"videoId":"${id}"[\\s\\S]{0,2000}?"lengthSeconds":"(\\d+)"`));
  const s = bloque ? Number(bloque[1]) : 0;
  return s > 0 ? s : null;
};

/**
 * @param {string[]} ids videoIds de YouTube
 * @returns {Promise<Map<string, number|null>>}
 */
export const obtenerDuraciones = async (ids) => {
  const unicos = [...new Set(ids)];
  const resultado = new Map();
  const faltan = [];
  for (const id of unicos) {
    const c = leerCache(id);
    if (c) resultado.set(id, c.duracion);
    else faltan.push(id);
  }
  if (faltan.length === 0) return resultado;

  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    for (let i = 0; i < faltan.length; i += 50) {
      const lote = faltan.slice(i, i + 50);
      try {
        const m = await porDataApi(lote, key);
        m.forEach((d, id) => {
          guardar(id, d);
          resultado.set(id, d);
        });
      } catch (err) {
        // Sin cachear: un error de cuota o de red no debe marcar los videos como rotos.
        console.error('[tv] Data API falló:', err.message);
        lote.forEach((id) => resultado.set(id, null));
      }
    }
    return resultado;
  }

  // Sin key: de a 6 en paralelo para no martillar a YouTube.
  for (let i = 0; i < faltan.length; i += 6) {
    const lote = faltan.slice(i, i + 6);
    const ds = await Promise.all(lote.map((id) => porPagina(id).catch(() => undefined)));
    lote.forEach((id, j) => {
      if (ds[j] !== undefined) guardar(id, ds[j]);
      resultado.set(id, ds[j] ?? null);
    });
  }
  return resultado;
};

/** Extrae el ID de YouTube de cualquier forma de link (mismo criterio que Overtime-Public). */
export const extraerYoutubeId = (input) => {
  const texto = (input || '').trim();
  if (!texto) return null;
  if (/^[\w-]{11}$/.test(texto)) return texto;
  let url;
  try {
    url = new URL(texto.startsWith('http') ? texto : `https://${texto}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return null;
  const v = url.searchParams.get('v');
  if (v && /^[\w-]{11}$/.test(v)) return v;
  const m = url.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
  return m ? m[1] : null;
};

/** Segundo de inicio desde `t=`/`start=` (106, 106s, 1m46s). */
export const extraerInicio = (input) => {
  let t = null;
  try {
    const s = (input || '').trim();
    const url = new URL(s.startsWith('http') ? s : `https://${s}`);
    t = url.searchParams.get('t') ?? url.searchParams.get('start');
  } catch {
    return 0;
  }
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
};

export const __test = { isoASegundos, cache };
