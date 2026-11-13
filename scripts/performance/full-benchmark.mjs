// Comprehensive Production & Local Performance Benchmark
import { performance } from 'node:perf_hooks';

const TARGET_URL = 'https://www.asuratopup.store/';

async function measureHttpPerformance() {
  console.log('--- 1. HTTP & CDN Edge Latency Benchmark ---');
  const samples = [];
  let cacheHeader = null;
  let encodingHeader = null;

  for (let i = 0; i < 6; i++) {
    const t0 = performance.now();
    const res = await fetch(TARGET_URL, {
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      },
    });
    const buf = await res.arrayBuffer();
    const dur = performance.now() - t0;
    samples.push({
      status: res.status,
      durMs: +dur.toFixed(1),
      bytes: buf.byteLength,
      cache: res.headers.get('x-vercel-cache') || res.headers.get('cf-cache-status') || 'n/a',
      encoding: res.headers.get('content-encoding') || 'none',
    });
    if (i === 0) {
      cacheHeader = res.headers.get('cache-control');
      encodingHeader = res.headers.get('content-encoding');
    }
  }

  const times = samples.map(s => s.durMs);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const avg = +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1);

  console.log({
    samples: samples.map(s => `${s.durMs}ms [${s.cache}]`),
    latencySummary: {
      minMs: min,
      avgMs: avg,
      maxMs: max,
      transferredBytes: samples[0].bytes,
    },
    edgeHeaders: {
      cacheControl: cacheHeader,
      contentEncoding: encodingHeader,
      lastVercelCache: samples[samples.length - 1].cache,
    },
  });
}

async function measurePayloadWeights() {
  console.log('\n--- 2. Asset Weight & Bundle Analysis ---');
  const res = await fetch(TARGET_URL);
  const html = await res.text();

  const scriptMatches = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map(m => m[1]);
  const cssMatches = [...html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map(m => m[1]);
  const imgMatches = [...html.matchAll(/src="([^"]+)"/g)].map(m => m[1]);

  let totalJsBytes = 0;
  for (const s of scriptMatches) {
    const r = await fetch(new URL(s, TARGET_URL));
    const buf = await r.arrayBuffer();
    totalJsBytes += buf.byteLength;
  }

  let totalCssBytes = 0;
  let allCss = '';
  for (const c of cssMatches) {
    const r = await fetch(new URL(c, TARGET_URL));
    const txt = await r.text();
    totalCssBytes += Buffer.byteLength(txt);
    allCss += '\n' + txt;
  }

  // Check image formats
  const webpImages = imgMatches.filter(i => i.includes('.webp')).length;
  const svgImages = imgMatches.filter(i => i.includes('.svg')).length;
  const pngImages = imgMatches.filter(i => i.includes('.png')).length;
  const jpgImages = imgMatches.filter(i => i.includes('.jpg') || i.includes('.jpeg')).length;

  console.log({
    documentHtmlSizeKB: +(Buffer.byteLength(html) / 1024).toFixed(1),
    javascriptBundles: {
      count: scriptMatches.length,
      totalUncompressedKB: +(totalJsBytes / 1024).toFixed(1),
    },
    stylesheets: {
      count: cssMatches.length,
      totalUncompressedKB: +(totalCssBytes / 1024).toFixed(1),
    },
    images: {
      totalFoundInHtml: imgMatches.length,
      modernWebPCount: webpImages,
      svgCount: svgImages,
      pngCount: pngImages,
      jpgCount: jpgImages,
    },
  });

  console.log('\n--- 3. Mobile Performance & Compositor Rules ---');
  const hasContentVisibility = allCss.includes('content-visibility:auto') || allCss.includes('content-visibility: auto');
  const hasDisabledCardShimmer = allCss.includes('game-card') && allCss.includes('animation:none!important');
  const hasDisabledMobileFloat = allCss.includes('luckyWheelSvg') && allCss.includes('animation:none');
  const hasDisabledNavbarWordmark = allCss.includes('wordmarkText') && allCss.includes('animation:none');

  console.log({
    mobileCompositorOptimizations: {
      contentVisibilityLazyRender: hasContentVisibility ? 'PASSED (offscreen sections deferred)' : 'MISSING',
      gameCardShimmerOnMobile: hasDisabledCardShimmer ? 'DISABLED (zero CPU repaint overhead on phone)' : 'ACTIVE (high CPU load)',
      floatingWidgetBounceOnMobile: hasDisabledMobileFloat ? 'DISABLED (smooth layer scrolling)' : 'ACTIVE',
      navbarWordmarkAnimationOnMobile: hasDisabledNavbarWordmark ? 'DISABLED (fixed header static)' : 'ACTIVE',
    },
  });
}

async function run() {
  await measureHttpPerformance();
  await measurePayloadWeights();
}

run().catch(console.error);

