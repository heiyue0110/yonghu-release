/**
 * 永狐网页版「离线外壳」Service Worker（2026-09-20）。
 *
 * 只在**浏览器网页版的生产构建**里注册：桌面端（Tauri）由
 * `src/services/offlineShell.ts` 负责「注册前就退出 + 注销 + 清缓存」，见那里的注释。
 * 这个文件是**独立静态文件**（public/sw.js，构建时原样复制到 dist/sw.js），
 * 不进入任何 JS 入口/异步 chunk，所以不占入口体积预算。
 *
 * 缓存策略唯一真相在 `offline-shell-policy.js`（白名单 / 黑名单都在那里），
 * 这里只负责三件事：安装时预缓存最小外壳、按策略转发请求、把状态回报给页面。
 *
 * ── 为什么导航用 network-first，静态资源用 stale-while-revalidate ──────────────
 *   1) `index.html` 是**版本敏感的入口**：它指向当前这一版的哈希 chunk。
 *      如果对它用 cache-first，用户会一直拿着旧外壳，直到缓存被手动清掉 —— 这正是
 *      「永远卡在旧版本」的成因。network-first 保证联网时每次打开都拿到最新外壳，
 *      只有真的断网才回落到缓存里那一份（配合页面里的「强制刷新并清缓存」兜底）。
 *   2) `/assets/*` 是**内容哈希**文件名：同一个 URL 的内容永远不会变，所以
 *      stale-while-revalidate 最划算 —— 先把缓存里的旧版本立刻给用户（秒开），
 *      同时在后台抓新版本写回缓存；新版本会以新文件名出现在新的 index.html 里，
 *      因此「后台校验」不会让用户继续跑旧代码。
 *   3) 更新清单 latest.json / data.json、云接口 /v2/…、ESI / zKillboard / Fuzzwork
 *      以及任何带 token 的请求**根本不进这个 SW 的缓存路径**（策略里直接判 bypass），
 *      所以离线外壳不会把「更新」缓存成永久离线，也不会缓存任何凭证。
 */
'use strict';

importScripts('./offline-shell-policy.js');

const POLICY = self.EverfoxOfflineShellPolicy;

/** 只有页面侧的诊断入口会读它；纯内存，不落盘。 */
const STATS = {
  navigationNetwork: 0,
  navigationCache: 0,
  navigationMiss: 0,
  assetRevalidated: 0,
  assetFromCache: 0,
  assetFromNetwork: 0,
  assetMissOffline: 0,
  bypassed: 0,
};

function offlineNoticeResponse() {
  return new Response('离线模式：应用外壳还没有缓存到本机。恢复网络后重新打开即可。', {
    status: 503,
    statusText: 'Offline',
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function openShellCache() {
  return caches.open(POLICY.SHELL_CACHE_NAME);
}

async function precacheShell() {
  const cache = await openShellCache();
  const results = await Promise.all(
    POLICY.SHELL_PRECACHE_URLS.map(async url => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
        return true;
      } catch (error) {
        // 离线安装、单个文件 404 都不能让整个外壳装不上。
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}

async function dropStaleShellCaches() {
  const names = await caches.keys();
  const stale = names.filter(
    name => name.indexOf(POLICY.SHELL_CACHE_PREFIX) === 0 && name !== POLICY.SHELL_CACHE_NAME,
  );
  await Promise.all(stale.map(name => caches.delete(name)));
  // 只清理本 SW 自己的缓存前缀，别的缓存（页面 localStorage/native 缓存）一律不动。
  return stale.length;
}

/** 导航：先网络（联网永远最新），失败才回落到缓存里的外壳。 */
async function networkFirstNavigation(request) {
  const cache = await openShellCache();
  try {
    const response = await fetch(request);
    if (POLICY.isCacheableResponse(response)) {
      await cache.put(POLICY.SHELL_NAVIGATION_CACHE_KEY, response.clone());
      STATS.navigationNetwork += 1;
    }
    return response;
  } catch (error) {
    const cached =
      (await cache.match(request)) || (await cache.match(POLICY.SHELL_NAVIGATION_CACHE_KEY));
    if (cached) {
      STATS.navigationCache += 1;
      return cached;
    }
    STATS.navigationMiss += 1;
    return offlineNoticeResponse();
  }
}

self.addEventListener('install', event => {
  if (!POLICY) return;
  event.waitUntil(
    (async () => {
      await precacheShell();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', event => {
  if (!POLICY) return;
  event.waitUntil(
    (async () => {
      await dropStaleShellCaches();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', event => {
  if (!POLICY) return;
  const request = event.request;
  if (request.method !== 'GET') {
    STATS.bypassed += 1;
    return;
  }
  const decision = POLICY.classifyRequest(request);
  if (decision.strategy === 'bypass') {
    STATS.bypassed += 1;
    return;
  }

  if (decision.strategy === 'network-first') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // stale-while-revalidate：先给缓存（秒开），后台抓新版本写回缓存。
  const cachePromise = openShellCache();
  const cachedPromise = cachePromise
    .then(cache => cache.match(request))
    .catch(() => undefined);
  const revalidatePromise = cachePromise
    .then(cache =>
      fetch(request).then(response => {
        if (POLICY.isCacheableResponse(response)) {
          STATS.assetRevalidated += 1;
          return cache.put(request, response.clone()).then(() => response);
        }
        return response;
      }),
    )
    .catch(() => null);

  event.waitUntil(revalidatePromise);
  event.respondWith(
    cachedPromise.then(async cached => {
      if (cached) {
        STATS.assetFromCache += 1;
        return cached;
      }
      const fresh = await revalidatePromise;
      if (fresh) {
        STATS.assetFromNetwork += 1;
        return fresh;
      }
      STATS.assetMissOffline += 1;
      return offlineNoticeResponse();
    }),
  );
});

self.addEventListener('message', event => {
  if (!POLICY) return;
  const data = event.data || {};
  if (data.type !== 'everfox-shell-stats') return;
  const payload = {
    type: 'everfox-shell-stats',
    cacheName: POLICY.SHELL_CACHE_NAME,
    cacheVersion: POLICY.SHELL_CACHE_VERSION,
    stats: Object.assign({}, STATS),
  };
  const port = event.ports && event.ports[0];
  if (port) port.postMessage(payload);
  else if (event.source) event.source.postMessage(payload);
});
