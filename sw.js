/* GSPS — Service worker.
   Stratégie « réseau d'abord, cache en secours » :
   - En ligne : chaque requête part au réseau (toujours la version la plus fraîche de l'app),
     et la réponse est mise en cache au passage.
   - Hors-ligne (ou requête réseau échouée) : on sert la dernière version connue depuis le cache,
     pour que l'application (page HTML, icônes, manifeste) se charge même sans connexion,
     y compris au tout premier écran (pas seulement les données, déjà gérées par Firestore).

   Important : à chaque mise à jour déployée de l'application, changez CACHE_NAME
   (ex. "gsps-cache-v27") pour que les anciens fichiers mis en cache soient purgés et
   remplacés par les nouveaux dès la prochaine visite en ligne. */

const CACHE_NAME = "gsps-cache-v34";
// Alias fixe sous lequel on garde toujours une copie de la dernière page HTML chargée,
// quel que soit son nom exact ou son chemin sur l'hébergement — pour pouvoir la retrouver
// hors-ligne même si l'URL de navigation diffère légèrement (avec ou sans paramètres, etc.).
const SHELL_ALIAS = "gsps-app-shell";

/* Bibliothèques tierces indispensables au démarrage : SDK Firebase (modules ES) et Chart.js.
   Elles sont versionnées dans leur URL, donc sûres à garder en cache : « cache d'abord ».
   Sans cela, l'application ne démarre pas hors-ligne (le SDK n'est pas chargé).
   Les échanges avec Firestore (firestore.googleapis.com) ne passent jamais par ce cache. */
const LIBS_PRECACHE = [
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
];
function estLibExterne(url){
  return (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) ||
         (url.hostname === "cdnjs.cloudflare.com" && url.pathname.startsWith("/ajax/libs/"));
}
/* Met en cache un module et, récursivement, les modules qu'il importe (./chunk.js). */
async function precacherModule(cache, urlStr, vus){
  if(vus.has(urlStr)) return;
  vus.add(urlStr);
  try{
    let rep = await cache.match(urlStr);
    if(!rep){
      rep = await fetch(urlStr, { mode: "cors" });
      if(!rep || !rep.ok) return;
      await cache.put(urlStr, rep.clone());
    }
    if(!/\.js($|\?)/.test(urlStr)) return;
    const txt = await rep.clone().text();
    // v34 : les modules du SDK Firebase s'importent aussi par URL ABSOLUE (https://www.gstatic.com/...) :
    // l'ancienne expression ne suivait que les chemins relatifs, donc firebase-component/-util/-logger
    // n'étaient pas pré-cachés et l'app ne démarrait pas hors-ligne après une première visite.
    const re = /(?:from|import)\s*["']((?:\.{1,2}\/|https:\/\/www\.gstatic\.com\/firebasejs\/)[^"']+)["']/g;
    let m; const suites = [];
    while((m = re.exec(txt))) suites.push(new URL(m[1], urlStr).href);
    await Promise.all(suites.map(u => precacherModule(cache, u, vus)));
  }catch(e){ /* hors-ligne pendant l'installation : sera rattrapé au prochain passage en ligne */ }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      const vus = new Set();
      return Promise.all(LIBS_PRECACHE.map(u => precacherModule(cache, u, vus)));
    })
  );
});

/* v34 : à la toute première visite, la page est chargée AVANT que le service worker contrôle la page ;
   elle n'était donc jamais mise en cache. La page envoie maintenant son URL et le service worker la
   récupère, ainsi que les icônes, pour que l'ouverture hors-ligne marche dès la première visite. */
self.addEventListener("message", (event) => {
  const d = event.data || {};
  if(d.type !== "cache-shell" || !d.url) return;
  event.waitUntil((async () => {
    try{
      const cache = await caches.open(CACHE_NAME);
      const u = new URL(d.url, self.location.href); u.hash = "";
      if(u.origin !== self.location.origin) return;
      const res = await fetch(u.href, { cache: "reload" });
      if(res && res.ok){
        await cache.put(u.href, res.clone());
        await cache.put(SHELL_ALIAS, res.clone());
      }
      await Promise.all((d.assets || []).map(async (a) => {
        try{
          const au = new URL(a, self.location.href);
          if(au.origin !== self.location.origin) return;
          const r = await fetch(au.href); if(r && r.ok) await cache.put(au.href, r);
        }catch(e){}
      }));
    }catch(e){}
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // On ne met en cache que les lectures, et uniquement sur notre propre origine :
  // les échanges avec Firestore/Firebase ne doivent jamais transiter par ce cache,
  // ils ont déjà leur propre gestion hors-ligne (IndexedDB via le SDK Firestore).
  const url = new URL(req.url);
  if(req.method !== "GET"){ return; }

  // Bibliothèques externes (SDK Firebase, Chart.js) : cache d'abord, réseau ensuite (et mise en cache).
  if(url.origin !== self.location.origin){
    if(!estLibExterne(url)) return;
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const enCache = await cache.match(req, { ignoreVary: true }) || await cache.match(req.url);
        if(enCache) return enCache;
        const res = await fetch(req);
        if(res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  const estNavigation = req.mode === "navigate";

  const rendreDepuisCache = async () => {
    const cache = await caches.open(CACHE_NAME);
    const correspondance = await cache.match(req) || (estNavigation ? await cache.match(req.url, { ignoreSearch: true }) : null);
    if(correspondance) return correspondance;
    if(estNavigation){
      const shell = await cache.match(SHELL_ALIAS);
      if(shell) return shell;
    }
    return null;
  };

  event.respondWith((async () => {
    const reseau = fetch(req).then((res) => {
      if(res && res.ok){
        // v25 : les copies sont faites AVANT de rendre `res` au navigateur.
        const copie = res.clone();
        const copieShell = estNavigation ? res.clone() : null;
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(req, copie);
          if(copieShell) cache.put(SHELL_ALIAS, copieShell);
        }).catch(() => {});
      }
      return res;
    });
    if(!estNavigation){
      try{ return await reseau; }
      catch(e){ return (await rendreDepuisCache()) || Response.error(); }
    }
    // v34 : sur une connexion « présente mais sans internet », fetch() peut rester bloqué très longtemps.
    // Pour la page elle-même, on bascule sur la copie en cache après 4 s (le réseau continue de mettre le cache à jour).
    const delai = new Promise((r) => setTimeout(() => r("delai"), 4000));
    try{
      const gagnant = await Promise.race([reseau, delai]);
      if(gagnant !== "delai") return gagnant;
      const cache = await rendreDepuisCache();
      return cache || await reseau;
    }catch(e){
      return (await rendreDepuisCache()) || Response.error();
    }
  })());
});
