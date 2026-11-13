// Mobile Performance Audit Script
const url = 'https://www.asuratopup.store/';

async function run() {
  const start = performance.now();
  const res = await fetch(url);
  const html = await res.text();
  const ttfb = performance.now() - start;

  const scriptMatches = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map(m => m[1]);
  const cssMatches = [...html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map(m => m[1]);
  const imgMatches = [...html.matchAll(/src="([^"]+)"/g)].map(m => m[1]);

  let totalJsBytes = 0;
  for (const s of scriptMatches) {
    const r = await fetch(new URL(s, url));
    const buf = await r.arrayBuffer();
    totalJsBytes += buf.byteLength;
  }

  let totalCssBytes = 0;
  let allCssText = '';
  for (const c of cssMatches) {
    const r = await fetch(new URL(c, url));
    const txt = await r.text();
    totalCssBytes += Buffer.byteLength(txt);
    allCssText += '\n' + txt;
  }

  // Analyze CSS for performance killers on mobile
  const backdropFilterCount = (allCssText.match(/backdrop-filter/gi) || []).length;
  const blurFilterCount = (allCssText.match(/filter:\s*blur/gi) || []).length;
  const boxShadowCount = (allCssText.match(/box-shadow/gi) || []).length;
  const infiniteAnimations = (allCssText.match(/animation:[^;]+infinite/gi) || []).length;
  const willChangeCount = (allCssText.match(/will-change/gi) || []).length;

  console.log({
    url,
    ttfbMs: +ttfb.toFixed(1),
    htmlBytes: Buffer.byteLength(html),
    scriptsCount: scriptMatches.length,
    totalJsKB: +(totalJsBytes / 1024).toFixed(1),
    cssCount: cssMatches.length,
    totalCssKB: +(totalCssBytes / 1024).toFixed(1),
    imagesInHtmlCount: imgMatches.length,
    cssPerformanceAnalysis: {
      backdropFilterCount,
      blurFilterCount,
      boxShadowCount,
      infiniteAnimations,
      willChangeCount
    }
  });
}

run().catch(console.error);

