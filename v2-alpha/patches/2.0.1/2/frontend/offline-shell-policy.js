/**
 * 永狐网页版「离线外壳」的缓存策略 —— 唯一真相（2026-09-20）。
 *
 * 这个文件同时被三处使用，所以策略只能写在这里一份：
 *   1. `public/sw.js` 通过 `importScripts('./offline-shell-policy.js')` 读取；
 *   2. `scripts/verify-offline-shell-cache-policy.mjs` 在 Node 里 vm 加载后逐条断言；
 *   3. `src/services/offlineShell.ts` 复用同一个缓存名前缀（门禁里断言两处字符串一致）。
 *
 * 原则（对应主人清单第 5 项）：
 *   - 只缓存**应用外壳**：HTML、构建出来的 JS/CSS/字体/图标、manifest；
 *   - 更新清单（latest.json / latest-beta.json）、静态数据清单（data.json）、
 *     云接口（/v2/…）、ESI / zKillboard / Fuzzwork / EVE Workbench 等数据接口、
 *     任何带 token / Authorization 的请求：**永远走网络，绝不进缓存**；
 *   - 判定顺序：先黑名单（host → 敏感头 → 敏感查询 → 路径），再看是不是外壳资源。
 *     黑名单优先，避免将来有人放宽白名单时把数据接口顺手缓存进来。
 *
 * 更新策略（两个，按请求类型二选一，理由见 sw.js 顶部注释）：
 *   - 导航请求（HTML）      → network-first（联网永远拿最新外壳，离线回落到缓存）
 *   - 同源外壳静态资源      → stale-while-revalidate（秒开 + 后台校验，不卡旧版本）
 */
(function (scope) {
  'use strict';

  const SHELL_CACHE_PREFIX = 'everfox-web-shell-';
  // 需要让缓存整体作废时 +1：activate 会删掉同前缀的旧缓存。
  const SHELL_CACHE_VERSION = 'v1';
  const SHELL_CACHE_NAME = SHELL_CACHE_PREFIX + SHELL_CACHE_VERSION;

  /**
   * 安装时预缓存的最小外壳（都是不带内容哈希、路径稳定的东西）。
   * 带哈希的 `/assets/*` 无法在静态 sw.js 里写死，靠 stale-while-revalidate 在
   * 首次访问时进缓存；离线时之所以仍能打开应用，是因为导航回落到这里缓存的 index.html，
   * 而它引用的 /assets/* 上一次联网时已经被 SWR 收进同一个缓存。
   */
  const SHELL_PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.webmanifest',
    './icons/everfox-32.png',
    './icons/everfox-128.png',
    './icons/everfox-256.png',
  ];

  /** 导航请求在线时抓到的新外壳统一存到这个固定键上，离线打开任意路径都回落到它。 */
  const SHELL_NAVIGATION_CACHE_KEY = './index.html';

  /** 外壳静态资源：只认这些目录 + 这些扩展名（精确路径单独列）。 */
  const SHELL_ASSET_PATH_PREFIXES = ['./assets/', './icons/'];
  const SHELL_ASSET_EXACT_PATHS = ['./manifest.webmanifest'];
  const SHELL_ASSET_EXTENSIONS = [
    '.js',
    '.mjs',
    '.css',
    '.woff',
    '.woff2',
    '.ttf',
    '.otf',
    '.png',
    '.svg',
    '.ico',
    '.webmanifest',
  ];

  /** 这些主机上的东西是数据接口，永远不缓存（即使同源部署也不缓存）。 */
  const NEVER_CACHE_HOST_RULES = [
    { label: 'esi', pattern: /(^|\.)esi\.evetech\.net$/i },
    { label: 'zkillboard', pattern: /(^|\.)zkillboard\.com$/i },
    { label: 'fuzzwork', pattern: /(^|\.)fuzzwork\.co\.uk$/i },
    { label: 'eveworkbench', pattern: /(^|\.)eveworkbench\.com$/i },
    { label: 'cloud-api', pattern: /(^|\.)(tcloudbase\.com|tencentcloudapi\.com|tcb-api\.tencentcloudapi\.com)$/i },
  ];

  /** 这些路径永远不缓存：更新清单、数据清单、云接口、开发代理、内置大表、音频。 */
  const NEVER_CACHE_PATH_RULES = [
    { label: 'cloud-api-v2', pattern: /^\/v2(\/|$)/i },
    { label: 'update-manifest', pattern: /\/latest(?:-beta)?\.json$/i },
    { label: 'static-data-manifest', pattern: /\/data\.json$/i },
    { label: 'dev-proxy', pattern: /^\/__everfox_proxy\//i },
    { label: 'fitting-data', pattern: /^\/fitting-data\//i },
    { label: 'bundled-static-data', pattern: /^\/data\//i },
    { label: 'universe-map', pattern: /^\/universe-map\.json$/i },
    { label: 'jump-bridges', pattern: /^\/jump-bridges(?:\.example)?\.json$/i },
    { label: 'sounds', pattern: /^\/sounds?\//i },
    { label: 'sound-file', pattern: /^\/sound\.wav$/i },
  ];

  const SENSITIVE_HEADER_NAMES = ['authorization', 'cookie', 'x-everfox-token', 'x-api-key'];
  const SENSITIVE_QUERY_KEYS = [
    'token',
    'access_token',
    'refresh_token',
    'id_token',
    'code',
    'api_key',
    'apikey',
    'auth',
    'authorization',
    'session',
    'ticket',
    'password',
    'secret',
  ];

  function baseHref() {
    return (scope.location && scope.location.href) || 'https://offline-shell.invalid/';
  }

  function currentOrigin() {
    return (scope.location && scope.location.origin) || '';
  }

  function resolveUrl(rawUrl) {
    try {
      return new URL(String(rawUrl), baseHref());
    } catch (error) {
      return null;
    }
  }

  function resolvedPath(rawPath) {
    const resolved = resolveUrl(rawPath);
    return resolved ? resolved.pathname : '';
  }

  function shellAssetPrefixes() {
    return SHELL_ASSET_PATH_PREFIXES.map(function (prefix) {
      const pathname = resolvedPath(prefix);
      if (!pathname) return '';
      return pathname.charAt(pathname.length - 1) === '/' ? pathname : pathname + '/';
    }).filter(Boolean);
  }

  function shellAssetExactPaths() {
    return SHELL_ASSET_EXACT_PATHS.map(resolvedPath).filter(Boolean);
  }

  function hasAllowedExtension(pathname) {
    const lower = String(pathname || '').toLowerCase();
    return SHELL_ASSET_EXTENSIONS.some(function (extension) {
      return lower.slice(-extension.length) === extension;
    });
  }

  function isShellAssetPath(pathname) {
    const path = String(pathname || '');
    if (!path) return false;
    if (shellAssetExactPaths().indexOf(path) >= 0) return true;
    return shellAssetPrefixes().some(function (prefix) {
      return path.indexOf(prefix) === 0 && hasAllowedExtension(path);
    });
  }

  function readRequestFacts(input) {
    const isString = typeof input === 'string';
    const record = isString ? null : input || {};
    const headers = record ? record.headers || null : null;
    return {
      url: isString ? String(input) : String(record.url || ''),
      method: String((isString ? 'GET' : record.method || 'GET')).toUpperCase(),
      mode: isString ? '' : String(record.mode || ''),
      destination: isString ? '' : String(record.destination || ''),
      headerValue: function (name) {
        if (!headers || typeof headers.get !== 'function') return '';
        const value = headers.get(name);
        return value ? String(value) : '';
      },
    };
  }

  function decision(strategy, reason) {
    return { strategy: strategy, reason: reason, cacheable: strategy !== 'bypass' };
  }

  /**
   * 判断一个请求该怎么处理：
   *   'bypass'                 —— 直接走网络，SW 不介入、不缓存
   *   'network-first'          —— 先网络后缓存（导航 / HTML）
   *   'stale-while-revalidate' —— 先缓存后后台校验（外壳静态资源）
   */
  function classifyRequest(input) {
    const facts = readRequestFacts(input);
    const target = resolveUrl(facts.url);
    if (!target) return decision('bypass', 'unparsable-url');
    if (facts.method !== 'GET') return decision('bypass', 'non-get-method');

    for (let index = 0; index < NEVER_CACHE_HOST_RULES.length; index += 1) {
      const rule = NEVER_CACHE_HOST_RULES[index];
      if (rule.pattern.test(target.host)) return decision('bypass', 'never-cache-host:' + rule.label);
    }

    const origin = currentOrigin();
    if (origin && target.origin !== origin) return decision('bypass', 'cross-origin');

    for (let index = 0; index < SENSITIVE_HEADER_NAMES.length; index += 1) {
      const name = SENSITIVE_HEADER_NAMES[index];
      if (facts.headerValue(name)) return decision('bypass', 'sensitive-header:' + name);
    }
    for (let index = 0; index < SENSITIVE_QUERY_KEYS.length; index += 1) {
      const key = SENSITIVE_QUERY_KEYS[index];
      if (target.searchParams.has(key)) return decision('bypass', 'sensitive-query:' + key);
    }
    for (let index = 0; index < NEVER_CACHE_PATH_RULES.length; index += 1) {
      const rule = NEVER_CACHE_PATH_RULES[index];
      if (rule.pattern.test(target.pathname)) return decision('bypass', 'never-cache-path:' + rule.label);
    }

    const isNavigation = facts.mode === 'navigate' || facts.destination === 'document';
    if (isNavigation) return decision('network-first', 'navigation');
    if (isShellAssetPath(target.pathname)) return decision('stale-while-revalidate', 'shell-asset');
    return decision('bypass', 'not-shell');
  }

  /** 只缓存可用的 200 同源响应；错误页、重定向、不透明响应一律不入缓存。 */
  function isCacheableResponse(response) {
    if (!response) return false;
    if (response.status !== 200) return false;
    if (response.type === 'opaque' || response.type === 'opaqueredirect') return false;
    return true;
  }

  scope.EverfoxOfflineShellPolicy = {
    SHELL_CACHE_PREFIX: SHELL_CACHE_PREFIX,
    SHELL_CACHE_VERSION: SHELL_CACHE_VERSION,
    SHELL_CACHE_NAME: SHELL_CACHE_NAME,
    SHELL_PRECACHE_URLS: SHELL_PRECACHE_URLS,
    SHELL_NAVIGATION_CACHE_KEY: SHELL_NAVIGATION_CACHE_KEY,
    SHELL_ASSET_PATH_PREFIXES: SHELL_ASSET_PATH_PREFIXES,
    SHELL_ASSET_EXACT_PATHS: SHELL_ASSET_EXACT_PATHS,
    SHELL_ASSET_EXTENSIONS: SHELL_ASSET_EXTENSIONS,
    NEVER_CACHE_HOST_RULES: NEVER_CACHE_HOST_RULES,
    NEVER_CACHE_PATH_RULES: NEVER_CACHE_PATH_RULES,
    SENSITIVE_HEADER_NAMES: SENSITIVE_HEADER_NAMES,
    SENSITIVE_QUERY_KEYS: SENSITIVE_QUERY_KEYS,
    isShellAssetPath: isShellAssetPath,
    isCacheableResponse: isCacheableResponse,
    classifyRequest: classifyRequest,
  };
})(typeof self !== 'undefined' ? self : globalThis);
