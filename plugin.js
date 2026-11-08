/**
 * BingeBang for Kino 1.2.0
 * Catalog: /api/*
 * Video: kino.browser.capture on /movie/play or /tv/play (real player network)
 *         + fallback /api/player/sources
 */
const BASE = "https://bingebang.st";
const IMG = "https://image.tmdb.org/t/p/";
const UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const ID_RE = /^[A-Za-z0-9._~-]{1,128}$/;

function log() {
  try {
    const a = [];
    for (let i = 0; i < arguments.length; i++) a.push(String(arguments[i]));
    kino.log(a.join(" "));
  } catch (e) {}
}

function err(code, detail, userMessage) {
  return kino.error(code, String(detail || "").slice(0, 200), {
    userMessage: String(userMessage || detail || "").slice(0, 200)
  });
}

function bodyText(r) {
  if (!r) return "";
  try {
    if (typeof r.text === "function") return String(r.text() || "");
  } catch (e) {}
  try {
    if (typeof r.text === "string") return r.text;
  } catch (e) {}
  return "";
}

async function apiGet(path, extraHeaders) {
  const url = path.indexOf("http") === 0 ? path : BASE + "/api/" + String(path).replace(/^\//, "");
  const headers = {
    "User-Agent": UA,
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: BASE + "/"
  };
  if (extraHeaders) {
    const keys = Object.keys(extraHeaders);
    for (let i = 0; i < keys.length; i++) headers[keys[i]] = extraHeaders[keys[i]];
  }
  const r = await kino.fetch(url, { headers: headers });
  const t = bodyText(r);
  let j = null;
  try {
    j = t ? JSON.parse(t) : null;
  } catch (e) {
    j = null;
  }
  return { ok: !!(r && r.ok), status: r ? r.status : 0, json: j, text: t };
}

function posterUrl(path, size) {
  if (!path) return "";
  const p = String(path);
  if (p.indexOf("http") === 0) return p.slice(0, 2048);
  return (IMG + (size || "w500") + p).slice(0, 2048);
}

function itemFrom(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.media_type === "tv" || raw.name ? "tv" : "movie";
  const idNum = raw.id;
  if (idNum == null) return null;
  const id = type + "-" + String(idNum);
  if (!ID_RE.test(id)) return null;
  const title = String(raw.title || raw.name || "").trim().slice(0, 200);
  if (!title) return null;
  const poster = posterUrl(raw.poster_path, "w500");
  const year = raw.year || (raw.release_date || raw.first_air_date || "").toString().slice(0, 4);
  const out = {
    id: id,
    ref: "a:" + type + ":" + idNum,
    title: title,
    kind: type === "movie" ? "movie" : "series"
  };
  if (poster) out.poster = poster;
  if (year && /^\d{4}$/.test(String(year))) out.year = parseInt(year, 10);
  if (raw.overview) out.overview = String(raw.overview).slice(0, 2000);
  if (raw.vote_average != null) {
    try {
      out.rating = Math.round(Number(raw.vote_average) * 10) / 10;
    } catch (e) {}
  }
  return out;
}

function mapList(data) {
  const rows = (data && data.results) || (Array.isArray(data) ? data : []);
  const out = [];
  const seen = {};
  for (let i = 0; i < rows.length; i++) {
    const it = itemFrom(rows[i]);
    if (!it || seen[it.id]) continue;
    seen[it.id] = true;
    out.push(it);
    if (out.length >= 40) break;
  }
  return out;
}

export async function search(query) {
  let q = "";
  try {
    if (typeof query === "string") q = query;
    else if (query && typeof query === "object") {
      q = String(query.q || query.originalTitle || "");
      if (!q && query.altTitles && query.altTitles[0]) q = String(query.altTitles[0]);
    }
  } catch (e) {}
  q = String(q || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 1) return [];
  log("search", q);
  const res = await apiGet("search/multi?query=" + encodeURIComponent(q));
  let items = mapList(res.json);
  items = items.filter(function (it) {
    return it.kind === "movie" || it.kind === "series";
  });
  log("search n", items.length);
  return items;
}

export async function home() {
  log("home");
  const rows = [];
  const sections = [
    { id: "tr_movie", title: "Peliculas en tendencia", path: "list/trending_movie_day?limit=24" },
    { id: "pop_movie", title: "Peliculas populares", path: "list/movie_popular?limit=24" },
    { id: "top_movie", title: "Peliculas mejor valoradas", path: "list/movie_top_rated?limit=24" },
    { id: "new_movie", title: "Peliculas recien anadidas", path: "discover/movie?sort=date_found" },
    { id: "tr_tv", title: "Series en tendencia", path: "list/trending_tv_day?limit=24" },
    { id: "pop_tv", title: "Series populares", path: "list/tv_popular?limit=24" },
    { id: "air_tv", title: "Series al aire", path: "list/tv_on_the_air?limit=24" },
    { id: "top_tv", title: "Series mejor valoradas", path: "list/tv_top_rated?limit=24" },
    { id: "new_tv", title: "Series recien anadidas", path: "discover/tv?sort=date_found" }
  ];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    try {
      const res = await apiGet(s.path);
      const items = mapList(res.json);
      if (items.length) rows.push({ id: s.id, title: s.title, ref: s.id, items: items });
      log("home", s.id, items.length);
    } catch (e) {
      log("home fail", s.id, (e && e.message) || e);
    }
  }
  if (!rows.length) throw err("unavailable", "empty home", "BingeBang no devolvio catalogo.");
  return rows;
}

export async function browse(ref, cursor) {
  await null;
  const key = String(ref || "");
  const page = Math.max(1, Math.min(50, parseInt(cursor || "1", 10) || 1));
  const map = {
    tr_movie: "list/trending_movie_day?limit=24",
    pop_movie: "list/movie_popular?limit=24",
    top_movie: "list/movie_top_rated?limit=24",
    new_movie: "discover/movie?sort=date_found&page=" + page,
    tr_tv: "list/trending_tv_day?limit=24",
    pop_tv: "list/tv_popular?limit=24",
    air_tv: "list/tv_on_the_air?limit=24",
    top_tv: "list/tv_top_rated?limit=24",
    new_tv: "discover/tv?sort=date_found&page=" + page,
    movies: "list/movie_popular?limit=24",
    series: "list/tv_popular?limit=24"
  };
  let path = map[key] || "list/movie_popular?limit=24";
  if ((key === "new_movie" || key === "new_tv") && path.indexOf("page=") < 0) {
    path += (path.indexOf("?") >= 0 ? "&" : "?") + "page=" + page;
  }
  const res = await apiGet(path);
  const items = mapList(res.json);
  const next =
    (key === "new_movie" || key === "new_tv") && items.length >= 15 ? String(page + 1) : null;
  return { items: items, next: next };
}

function parseRef(ref) {
  const s = String(ref || "").trim();
  let m = /^a:(movie|tv):(\d+)$/.exec(s);
  if (m) return { type: m[1], id: m[2], season: 1, episode: 1 };
  m = /^e:(movie|tv):(\d+):(\d+):(\d+)$/.exec(s);
  if (m) {
    return {
      type: m[1],
      id: m[2],
      season: parseInt(m[3], 10) || 1,
      episode: parseInt(m[4], 10) || 1
    };
  }
  m = /^(movie|tv)-(\d+)$/.exec(s);
  if (m) return { type: m[1], id: m[2], season: 1, episode: 1 };
  return null;
}

export async function episodes(ref) {
  await null;
  const p = parseRef(ref);
  if (!p) throw err("not_found", "ref " + ref, "Titulo no valido.");
  log("episodes", p.type, p.id);

  if (p.type === "movie") {
    const res = await apiGet("movie/" + p.id);
    const d = res.json;
    if (!d) throw err("not_found", "movie " + p.id, "Pelicula no encontrada.");
    const title = String(d.title || "Movie").slice(0, 200);
    const poster = posterUrl(d.poster_path, "w500");
    const backdrop = posterUrl(d.backdrop_path, "w1280");
    return {
      series: {
        title: title,
        overview: String(d.overview || "").slice(0, 2000),
        poster: poster,
        backdrop: backdrop || poster
      },
      episodes: [
        {
          season: 1,
          number: 1,
          ref: "e:movie:" + p.id + ":1:1",
          title: title,
          still: backdrop || poster
        }
      ]
    };
  }

  const res = await apiGet("tv/" + p.id);
  const d = res.json;
  if (!d) throw err("not_found", "tv " + p.id, "Serie no encontrada.");
  const title = String(d.name || d.title || "Series").slice(0, 200);
  const poster = posterUrl(d.poster_path, "w500");
  const backdrop = posterUrl(d.backdrop_path, "w1280");
  const series = {
    title: title,
    overview: String(d.overview || "").slice(0, 2000),
    poster: poster,
    backdrop: backdrop || poster
  };

  const seasons = Array.isArray(d.seasons) ? d.seasons : [];
  const list = [];
  const started = Date.now();
  for (let i = 0; i < seasons.length; i++) {
    if (Date.now() - started > 16000) break;
    const sn = parseInt(seasons[i].season_number, 10);
    if (!(sn >= 0 && sn <= 50)) continue;
    if (seasons[i].available_episodes === 0) continue;
    try {
      const sd = await apiGet("tv/" + p.id + "/season/" + sn);
      const eps = (sd.json && sd.json.episodes) || [];
      for (let j = 0; j < eps.length; j++) {
        const ep = eps[j];
        const num = parseInt(ep.episode_number, 10);
        if (!num) continue;
        const still = posterUrl(ep.still_path, "w300") || poster;
        list.push({
          season: sn || 1,
          number: num,
          ref: "e:tv:" + p.id + ":" + (sn || 1) + ":" + num,
          title: String(ep.name || "Episode " + num).slice(0, 200),
          still: still,
          overview: ep.overview ? String(ep.overview).slice(0, 500) : undefined
        });
      }
    } catch (e) {
      log("season fail", sn, (e && e.message) || e);
    }
  }

  if (!list.length) {
    list.push({
      season: 1,
      number: 1,
      ref: "e:tv:" + p.id + ":1:1",
      title: "Episode 1",
      still: poster
    });
  }
  list.sort(function (a, b) {
    return a.season === b.season ? a.number - b.number : a.season - b.season;
  });
  log("episodes n", list.length);
  return { series: series, episodes: list };
}

function collectStreams(j) {
  const out = [];
  const seen = {};
  function add(url, label, headers) {
    if (!url || typeof url !== "string") return;
    url = url.trim();
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (url.indexOf("http") !== 0) return;
    if (/turnstile|cloudflare\.com\/cdn-cgi|google-analytics|googletag/i.test(url)) return;
    if (seen[url]) return;
    seen[url] = true;
    const s = { url: url, label: String(label || "Server").slice(0, 80) };
    if (headers) s.headers = headers;
    out.push(s);
  }
  function walk(node, labelHint) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) walk(node[i], labelHint);
      return;
    }
    if (typeof node === "string") {
      if (/^https?:\/\//i.test(node)) add(node, labelHint || "Server");
      return;
    }
    if (typeof node !== "object") return;
    const label =
      node.name || node.title || node.server || node.label || node.provider || node.quality || labelHint || "Server";
    const url =
      node.url || node.src || node.file || node.stream || node.link || node.href || node.playlist || node.m3u8 || node.embed;
    if (url) add(url, label, node.headers || null);
    const kids = ["sources", "servers", "streams", "embeds", "results", "data", "items", "list", "files", "links", "downloads", "media"];
    for (let k = 0; k < kids.length; k++) {
      if (node[kids[k]]) walk(node[kids[k]], label);
    }
  }
  walk(j, "Server");
  return out;
}

function playUrlFor(detail, p) {
  if (!detail) return "";
  if (p.type === "movie") {
    if (detail.play_url) return detail.play_url;
    if (detail.url) return String(detail.url).replace("/watch/", "/play/");
    return "";
  }
  // TV episode
  if (detail.play_url && /\/\d+\/\d+/.test(detail.play_url)) return detail.play_url;
  let base = detail.play_url || detail.url || "";
  base = String(base).replace("/watch/", "/play/");
  // strip trailing /s/e if any then append
  base = base.replace(/\/\d+\/\d+$/, "");
  if (!base) return "";
  return base + "/" + p.season + "/" + p.episode;
}

async function resolveViaSourcesApi(p, detail) {
  let q =
    "player/sources?type=" +
    encodeURIComponent(p.type) +
    "&id=" +
    encodeURIComponent(p.id);
  if (p.type === "tv") {
    q +=
      "&season=" +
      encodeURIComponent(String(p.season)) +
      "&episode=" +
      encodeURIComponent(String(p.episode));
  }
  const playerHeaders = {
    "X-BB-Player": "1",
    Referer: BASE + (detail.play_url || detail.url || "/"),
    Origin: BASE
  };
  const src = await apiGet(q, playerHeaders);
  log("sources status", src.status, (src.text || "").slice(0, 140));
  if (src.json) return collectStreams(src.json);
  return [];
}

async function resolveViaBrowser(playPath) {
  if (!kino.browser || typeof kino.browser.capture !== "function") {
    log("browser capture not available");
    return [];
  }
  const url = playPath.indexOf("http") === 0 ? playPath : BASE + playPath;
  log("browser capture", url);
  try {
    const page = await kino.browser.capture(url, {
      timeoutMs: 28000,
      captureAll: true,
      match: "\\.m3u8|\\.mp4|/stream|manifest|playlist|video",
      alsoMatch: ["\\.m3u8", "\\.mp4", "/embed/"]
    });
    const streams = [];
    const media = (page && page.media) || [];
    for (let i = 0; i < media.length; i++) {
      const m = media[i];
      if (!m || !m.url) continue;
      if (/turnstile|cloudflare\.com\/cdn-cgi/i.test(m.url)) continue;
      streams.push({
        url: m.url,
        label: "Server " + (i + 1),
        headers: m.headers || { "User-Agent": UA, Referer: BASE + "/" }
      });
    }
    // also scan generic requests
    const reqs = (page && page.requests) || [];
    for (let i = 0; i < reqs.length; i++) {
      const r = reqs[i];
      if (!r || !r.url) continue;
      if (!/\.m3u8|\.mp4|\/stream|manifest|playlist/i.test(r.url)) continue;
      if (/turnstile|cloudflare\.com\/cdn-cgi/i.test(r.url)) continue;
      let already = false;
      for (let j = 0; j < streams.length; j++) {
        if (streams[j].url === r.url) {
          already = true;
          break;
        }
      }
      if (!already) {
        streams.push({
          url: r.url,
          label: "Stream",
          headers: r.headers || { "User-Agent": UA, Referer: BASE + "/" }
        });
      }
    }
    log("browser streams", streams.length);
    return streams;
  } catch (e) {
    log("browser fail", (e && e.code) || "", (e && e.message) || e);
    return [];
  }
}

export async function resolve(ref) {
  await null;
  const p = parseRef(ref);
  if (!p) throw err("not_found", "ref " + ref, "Enlace no valido.");
  log("resolve", p.type, p.id, "s" + p.season + "e" + p.episode);

  const detailRes = await apiGet(p.type + "/" + p.id);
  const detail = detailRes.json;
  if (!detail) throw err("not_found", "missing", "Titulo no encontrado en BingeBang.");

  // For TV, prefer episode play_url from season endpoint
  if (p.type === "tv") {
    try {
      const sd = await apiGet("tv/" + p.id + "/season/" + p.season);
      const eps = (sd.json && sd.json.episodes) || [];
      for (let i = 0; i < eps.length; i++) {
        if (parseInt(eps[i].episode_number, 10) === p.episode && eps[i].play_url) {
          detail.play_url = eps[i].play_url;
          break;
        }
      }
    } catch (e) {}
  }

  let streams = [];

  // 1) Fast path: API (may 403 from some networks)
  try {
    streams = await resolveViaSourcesApi(p, detail);
  } catch (e) {
    log("sources err", (e && e.message) || e);
  }

  // 2) Real player page via hidden browser (works when site allows without captcha)
  if (!streams.length) {
    const playPath = playUrlFor(detail, p);
    if (playPath) {
      streams = await resolveViaBrowser(playPath);
    }
  }

  if (!streams.length) {
    throw err(
      "unavailable",
      "no streams",
      "No se pudo obtener video. Si usas VPN desactivala y reintenta. Acepta el permiso del navegador oculto al instalar."
    );
  }

  const primary = streams[0];
  const stream = {
    url: primary.url,
    headers: Object.assign(
      { "User-Agent": UA, Referer: BASE + "/" },
      primary.headers || {}
    ),
    label: primary.label || "BingeBang",
    expiresInSeconds: 3600
  };
  if (streams.length > 1) {
    stream.alternatives = streams.slice(1, 12).map(function (s) {
      return {
        url: s.url,
        headers: Object.assign(
          { "User-Agent": UA, Referer: BASE + "/" },
          s.headers || {}
        ),
        label: s.label || "Server"
      };
    });
  }
  log("resolve OK", stream.label, "n=" + streams.length);
  return stream;
}
