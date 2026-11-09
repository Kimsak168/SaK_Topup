import fs from "fs";
import path from "path";
import * as simpleIcons from "simple-icons";

const OUT_DIR = path.resolve("public/images/digital/logos");
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// Helper to create a dark premium card with centered brand icon
function makeBrandCard({ hex, bg = "#0B0813", fg, pathD, scale = 12, offsetX = 112, offsetY = 112 }) {
  const iconColor = fg || `#${hex}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="card-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#${hex}" stop-opacity="0.22" />
      <stop offset="70%" stop-color="#${hex}" stop-opacity="0.04" />
      <stop offset="100%" stop-color="#${hex}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="${bg}" />
  <circle cx="256" cy="256" r="230" fill="url(#card-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#${hex}" stroke-opacity="0.22" stroke-width="2" />
  <g transform="translate(${offsetX}, ${offsetY}) scale(${scale})" fill="${iconColor}">
    ${pathD}
  </g>
</svg>`;
}

async function fetchWikiSvg(filename) {
  try {
    const infoUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      filename
    )}&prop=imageinfo&iiprop=url&format=json`;
    const res = await fetch(infoUrl, {
      headers: { "User-Agent": "SaksuuuTopUp/1.0 (contact@saksuuu.com)" },
    });
    const data = await res.json();
    const page = Object.values(data.query.pages)[0];
    const rawUrl = page?.imageinfo?.[0]?.url;
    if (!rawUrl) return null;

    const imgRes = await fetch(rawUrl, {
      headers: { "User-Agent": "SaksuuuTopUp/1.0 (contact@saksuuu.com)" },
    });
    if (!imgRes.ok) return null;
    return await imgRes.text();
  } catch (err) {
    console.error(`Failed to fetch ${filename}:`, err);
    return null;
  }
}

async function run() {
  console.log("Generating real logos for all digital products...");

  // Mapping from simple-icons keys
  const simpleIconsMap = {
    "apple-service": { icon: simpleIcons.siApple, hex: "FFFFFF", bg: "#000000", fg: "#FFFFFF" },
    autodesk: { icon: simpleIcons.siAutodesk, hex: "0696D7", bg: "#06121E" },
    "avira-prime": { icon: simpleIcons.siAvira, hex: "E02027", bg: "#1A0608" },
    "claude-api-keys": { icon: simpleIcons.siAnthropic, hex: "CC785C", bg: "#191414" },
    "coursera-premium-12-months": { icon: simpleIcons.siCoursera, hex: "0056D2", bg: "#071426" },
    crunchyroll: { icon: simpleIcons.siCrunchyroll, hex: "FF5E00", bg: "#1A0C03" },
    "duolingo-super-slot-3-months": { icon: simpleIcons.siDuolingo, hex: "58CC02", bg: "#0D1E04" },
    elevenlabs: { icon: simpleIcons.siElevenlabs, hex: "FFFFFF", bg: "#0D0D11" },
    "expressvpn-private-5-devices": { icon: simpleIcons.siExpressvpn, hex: "DA3940", bg: "#1C0608" },
    "figma-education-pro": { icon: simpleIcons.siFigma, hex: "F24E1E", bg: "#120E1C" },
    "framer-ai": { icon: simpleIcons.siFramer, hex: "0055FF", bg: "#040D1E" },
    "gemini-plus": { icon: simpleIcons.siGooglegemini, hex: "8E75B2", bg: "#0F0C1C" },
    "gmail-accounts": { icon: simpleIcons.siGmail, hex: "EA4335", bg: "#1A0A08" },
    "jetbrain-edu-12-months-special-offer": { icon: simpleIcons.siJetbrains, hex: "FF318C", bg: "#000000" },
    netflix: { icon: simpleIcons.siNetflix, hex: "E50914", bg: "#000000" },
    "nordvpn-3-months-link": { icon: simpleIcons.siNordvpn, hex: "4687FF", bg: "#061022" },
    "notion-plus-business": { icon: simpleIcons.siNotion, hex: "FFFFFF", bg: "#000000" },
    "paramount-plus": { icon: simpleIcons.siParamountplus, hex: "0064FF", bg: "#001033" },
    protonvpn: { icon: simpleIcons.siProtonvpn, hex: "6D4AFF", bg: "#120A24" },
    railway: { icon: simpleIcons.siRailway, hex: "FFFFFF", bg: "#0B0D0E" },
    "spotify-premium-3m": { icon: simpleIcons.siSpotify, hex: "1ED760", bg: "#06170C" },
    steam: { icon: simpleIcons.siSteam, hex: "FFFFFF", bg: "#171A21" },
    "supergrok-5-59-only": { icon: simpleIcons.siX, hex: "FFFFFF", bg: "#000000" },
    "surfshark-vpn": { icon: simpleIcons.siSurfshark, hex: "1EBFBF", bg: "#031717" },
    udemy: { icon: simpleIcons.siUdemy, hex: "A435F0", bg: "#170524" },
    "youtube-premium-2": { icon: simpleIcons.siYoutube, hex: "FF0000", bg: "#1A0000" },
    zoom: { icon: simpleIcons.siZoom, hex: "0B5CFF", bg: "#041029" },
    "edx-premuim": { icon: simpleIcons.siEdx, hex: "B52555", bg: "#1C050D" },
  };

  for (const [slug, cfg] of Object.entries(simpleIconsMap)) {
    if (!cfg.icon) continue;
    const svg = makeBrandCard({
      hex: cfg.hex,
      bg: cfg.bg,
      fg: cfg.fg,
      pathD: `<path d="${cfg.icon.path}" />`,
    });
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.svg`), svg, "utf8");
    console.log(`Generated: ${slug}.svg`);
  }

  // Next, fetch or render custom vector icons for the remaining products
  // 1. ChatGPT
  const chatGptRaw = await fetchWikiSvg("File:ChatGPT_logo.svg");
  if (chatGptRaw) {
    fs.writeFileSync(path.join(OUT_DIR, "chatgpt.svg"), chatGptRaw, "utf8");
    console.log("Generated: chatgpt.svg (Official Vector)");
  }

  // 2. Canva
  const canvaRaw = await fetchWikiSvg("File:Canva_Logo.svg");
  if (canvaRaw) {
    const canvaCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="canva-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#00C4CC" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#7D2AE8" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="canva-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#081026" />
      <stop offset="100%" stop-color="#030611" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#canva-bg)" />
  <circle cx="256" cy="256" r="230" fill="url(#canva-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#00C4CC" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(86, 176) scale(4.25)">
    ${canvaRaw.replace(/^<svg[^>]*>|<\/svg>$/gi, "")}
  </g>
</svg>`;
    fs.writeFileSync(path.join(OUT_DIR, "canva.svg"), canvaCard, "utf8");
    console.log("Generated: canva.svg (Official Vector)");
  }

  // 3. CapCut
  const capcutRaw = await fetchWikiSvg("File:Capcut-logo.svg");
  if (capcutRaw) {
    const capcutCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="capcut-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#00F0FF" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#FF0055" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#000000" />
  <circle cx="256" cy="256" r="230" fill="url(#capcut-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#00F0FF" stroke-opacity="0.25" stroke-width="2" />
  <g transform="translate(48, 206) scale(3.3)">
    ${capcutRaw.replace(/^<svg[^>]*>|<\/svg>$/gi, "")}
  </g>
</svg>`;
    fs.writeFileSync(path.join(OUT_DIR, "capcut-pro-2.svg"), capcutCard, "utf8");
    fs.writeFileSync(path.join(OUT_DIR, "capcut-pro-personal-team.svg"), capcutCard, "utf8");
    console.log("Generated: capcut-pro-2.svg & capcut-pro-personal-team.svg (Official Vector)");
  }

  // 4. Amazon Prime Video
  const primeRaw = await fetchWikiSvg("File:Amazon_Prime_Video_logo.svg");
  if (primeRaw) {
    const primeCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="prime-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#00A8E1" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#00A8E1" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#00050D" />
  <circle cx="256" cy="256" r="230" fill="url(#prime-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#00A8E1" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(56, 170) scale(0.65)">
    ${primeRaw.replace(/^<svg[^>]*>|<\/svg>$/gi, "")}
  </g>
</svg>`;
    fs.writeFileSync(path.join(OUT_DIR, "amazon-prime.svg"), primeCard, "utf8");
    console.log("Generated: amazon-prime.svg (Official Vector)");
  }

  // 5. Microsoft Office 365
  const officeCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="office-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#D83B01" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#EA3E23" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="m1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#F25022"/></linearGradient>
    <linearGradient id="m2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7FBA00"/></linearGradient>
    <linearGradient id="m3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#00A4EF"/></linearGradient>
    <linearGradient id="m4" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFB900"/></linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#0E0A12" />
  <circle cx="256" cy="256" r="230" fill="url(#office-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#D83B01" stroke-opacity="0.25" stroke-width="2" />
  <!-- Microsoft 4-square Official Mark -->
  <g transform="translate(136, 136)">
    <rect x="0" y="0" width="112" height="112" rx="12" fill="url(#m1)" />
    <rect x="128" y="0" width="112" height="112" rx="12" fill="url(#m2)" />
    <rect x="0" y="128" width="112" height="112" rx="12" fill="url(#m3)" />
    <rect x="128" y="128" width="112" height="112" rx="12" fill="url(#m4)" />
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "microsoft-office-365.svg"), officeCard, "utf8");
  console.log("Generated: microsoft-office-365.svg (Microsoft 365 Official Mark)");

  // 6. Microsoft Outlook
  const outlookCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="outlook-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#0078D4" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#0078D4" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="out-blue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0078D4" />
      <stop offset="100%" stop-color="#005A9E" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#05101E" />
  <circle cx="256" cy="256" r="230" fill="url(#outlook-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#0078D4" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(116, 136)">
    <!-- Envelope Base -->
    <rect x="30" y="30" width="220" height="160" rx="18" fill="url(#out-blue)" />
    <path d="M30 50 L140 135 L250 50" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
    <!-- O Badge -->
    <rect x="0" y="70" width="110" height="110" rx="24" fill="#0078D4" stroke="#FFFFFF" stroke-width="4" />
    <text x="55" y="148" font-family="system-ui, -apple-system, sans-serif" font-size="76" font-weight="900" fill="#FFFFFF" text-anchor="middle">O</text>
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "outlook-good-quality-0-05-only.svg"), outlookCard, "utf8");
  console.log("Generated: outlook.svg (Official Outlook Vector)");

  // 7. Adobe Express
  const adobeCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="adobe-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#FA0F00" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#FA0F00" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#140203" />
  <circle cx="256" cy="256" r="230" fill="url(#adobe-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#FA0F00" stroke-opacity="0.3" stroke-width="2" />
  <!-- Adobe Official 'A' Emblem -->
  <g transform="translate(136, 136)">
    <rect width="240" height="240" rx="36" fill="#FA0F00" />
    <polygon points="152,36 212,204 172,204 148,136 100,204 28,204 96,36" fill="#FFFFFF" />
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "adobe.svg"), adobeCard, "utf8");
  console.log("Generated: adobe.svg (Official Adobe Vector)");

  // 8. LinkedIn
  const linkedinCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="li-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#0A66C2" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#0A66C2" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#040D1A" />
  <circle cx="256" cy="256" r="230" fill="url(#li-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#0A66C2" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(136, 136)">
    <rect width="240" height="240" rx="44" fill="#0A66C2" />
    <!-- 'in' mark -->
    <circle cx="68" cy="68" r="20" fill="#FFFFFF" />
    <rect x="48" y="104" width="40" height="96" rx="6" fill="#FFFFFF" />
    <path d="M128 104 h38 v14 c10-12 26-18 42-18 32 0 52 20 52 56 v44 h-40 v-38 c0-16-6-26-20-26 -14 0-22 10-22 24 v40 h-40 v-96 z" fill="#FFFFFF" />
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "linkedin.svg"), linkedinCard, "utf8");
  console.log("Generated: linkedin.svg (Official LinkedIn Vector)");

  // 9. Peacock
  const peacockCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="peacock-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#00A859" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#00A859" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#000000" />
  <circle cx="256" cy="256" r="230" fill="url(#peacock-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#00A859" stroke-opacity="0.25" stroke-width="2" />
  <!-- Peacock 6-color fan -->
  <g transform="translate(256, 270)">
    <circle cx="-110" cy="-20" r="32" fill="#FFC72C" />
    <circle cx="-70" cy="-80" r="32" fill="#FF8200" />
    <circle cx="-25" cy="-120" r="32" fill="#EF3340" />
    <circle cx="25" cy="-120" r="32" fill="#8B268F" />
    <circle cx="70" cy="-80" r="32" fill="#004C97" />
    <circle cx="110" cy="-20" r="32" fill="#00A859" />
    <path d="M-8 30 C -8 -40 8 -40 8 30 Z" fill="#FFFFFF" />
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "peacock.svg"), peacockCard, "utf8");
  console.log("Generated: peacock.svg (Official Peacock Vector)");

  // 10. HMA VPN
  const hmaCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="hma-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#FFCC00" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#FFCC00" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#0A111E" />
  <circle cx="256" cy="256" r="230" fill="url(#hma-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#FFCC00" stroke-opacity="0.25" stroke-width="2" />
  <g transform="translate(136, 136)">
    <circle cx="120" cy="120" r="110" fill="#FFCC00" />
    <text x="120" y="145" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="900" fill="#0E1626" text-anchor="middle">HMA</text>
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "hma-vpn.svg"), hmaCard, "utf8");
  console.log("Generated: hma-vpn.svg");

  // 11. iLovePDF
  const ilovepdfCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="pdf-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#E53238" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#E53238" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#140506" />
  <circle cx="256" cy="256" r="230" fill="url(#pdf-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#E53238" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(136, 126)">
    <!-- Heart & PDF -->
    <path d="M120 40 C 80 -10 10 20 20 80 C 30 140 120 200 120 200 C 120 200 210 140 220 80 C 230 20 160 -10 120 40 Z" fill="#E53238" />
    <rect x="70" y="80" width="100" height="44" rx="8" fill="#FFFFFF" />
    <text x="120" y="112" font-family="system-ui, sans-serif" font-size="28" font-weight="900" fill="#E53238" text-anchor="middle">PDF</text>
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "ilovepdf.svg"), ilovepdfCard, "utf8");
  console.log("Generated: ilovepdf.svg");

  // 12. Leonardo AI
  const leonardoCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="leo-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#A855F7" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#EC4899" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="leo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#A855F7" />
      <stop offset="50%" stop-color="#EC4899" />
      <stop offset="100%" stop-color="#EAB308" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#0A0614" />
  <circle cx="256" cy="256" r="230" fill="url(#leo-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#A855F7" stroke-opacity="0.3" stroke-width="2" />
  <!-- Leonardo 3D Cube Poly -->
  <g transform="translate(156, 146)">
    <polygon points="100,10 190,60 190,160 100,210 10,160 10,60" fill="none" stroke="url(#leo-grad)" stroke-width="18" stroke-linejoin="round" />
    <polyline points="10,60 100,110 190,60" fill="none" stroke="url(#leo-grad)" stroke-width="18" stroke-linejoin="round" />
    <line x1="100" y1="110" x2="100" y2="210" stroke="url(#leo-grad)" stroke-width="18" />
    <circle cx="100" cy="110" r="14" fill="#FFFFFF" />
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "leonardo-seedance-2-5-8500-cr.svg"), leonardoCard, "utf8");
  console.log("Generated: leonardo.svg");

  // 13. Lovable
  const lovableCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="lov-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#FF3366" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#FF3366" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#120409" />
  <circle cx="256" cy="256" r="230" fill="url(#lov-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#FF3366" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(136, 136)">
    <path d="M120 45 C 85 -5 15 25 25 85 C 35 145 120 205 120 205 C 120 205 205 145 215 85 C 225 25 155 -5 120 45 Z" fill="#FF3366" />
    <path d="M90 95 L65 120 L90 145 M150 95 L175 120 L150 145" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "lovable-lite.svg"), lovableCard, "utf8");
  console.log("Generated: lovable-lite.svg");

  // 14. Magic Patterns
  const magicCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="mag-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#6366F1" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#6366F1" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#0A0A1C" />
  <circle cx="256" cy="256" r="230" fill="url(#mag-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#6366F1" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(146, 146)">
    <rect x="0" y="0" width="96" height="96" rx="20" fill="#6366F1" />
    <rect x="116" y="0" width="96" height="96" rx="20" fill="#A855F7" />
    <rect x="0" y="116" width="96" height="96" rx="20" fill="#EC4899" />
    <rect x="116" y="116" width="96" height="96" rx="20" fill="#3B82F6" />
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "magic-patterns.svg"), magicCard, "utf8");
  console.log("Generated: magic-patterns.svg");

  // 15. Manus
  const manusCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="manus-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#00F0FF" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#00F0FF" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#040914" />
  <circle cx="256" cy="256" r="230" fill="url(#manus-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#00F0FF" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(146, 146)">
    <circle cx="110" cy="110" r="90" fill="none" stroke="#00F0FF" stroke-width="16" />
    <circle cx="110" cy="110" r="45" fill="#00F0FF" />
    <text x="110" y="132" font-family="system-ui, sans-serif" font-size="64" font-weight="900" fill="#040914" text-anchor="middle">M</text>
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "manus.svg"), manusCard, "utf8");
  console.log("Generated: manus.svg");

  // 16. Muse AI
  const museCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="muse-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#EC4899" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#EC4899" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#12050E" />
  <circle cx="256" cy="256" r="230" fill="url(#muse-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#EC4899" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(136, 156)">
    <rect x="10" y="70" width="30" height="60" rx="15" fill="#EC4899" />
    <rect x="60" y="30" width="30" height="140" rx="15" fill="#F43F5E" />
    <rect x="110" y="0" width="30" height="200" rx="15" fill="#A855F7" />
    <rect x="160" y="40" width="30" height="120" rx="15" fill="#8B5CF6" />
    <rect x="210" y="70" width="30" height="60" rx="15" fill="#6366F1" />
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "muse-ai.svg"), museCard, "utf8");
  console.log("Generated: muse-ai.svg");

  // 17. Readwise
  const readwiseCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="rw-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#120D04" />
  <circle cx="256" cy="256" r="230" fill="url(#rw-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#F59E0B" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(146, 166)">
    <!-- Open Book / Glasses -->
    <path d="M110 30 C 70 0 10 10 0 20 L 0 170 C 10 160 70 150 110 180 C 150 150 210 160 220 170 L 220 20 C 210 10 150 0 110 30 Z" fill="#F59E0B" />
    <line x1="110" y1="30" x2="110" y2="180" stroke="#120D04" stroke-width="8" />
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "readwise.svg"), readwiseCard, "utf8");
  console.log("Generated: readwise.svg");

  // 18. Wink
  const winkCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="wink-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#EC4899" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#A855F7" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#140612" />
  <circle cx="256" cy="256" r="230" fill="url(#wink-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#EC4899" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(136, 146)">
    <circle cx="120" cy="110" r="85" fill="#EC4899" />
    <path d="M60 110 Q 85 140 110 110" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" />
    <circle cx="165" cy="105" r="14" fill="#FFFFFF" />
    <polygon points="120,20 128,45 150,45 132,60 138,82 120,68 102,82 108,60 90,45 112,45" fill="#FDE047" />
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "wink.svg"), winkCard, "utf8");
  console.log("Generated: wink.svg");

  // 19. Wispr Flow
  const wisprCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="wispr-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#3B82F6" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#040C1A" />
  <circle cx="256" cy="256" r="230" fill="url(#wispr-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#3B82F6" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(146, 146)">
    <rect x="80" y="30" width="60" height="110" rx="30" fill="#3B82F6" />
    <path d="M50 100 C 50 160 170 160 170 100" fill="none" stroke="#3B82F6" stroke-width="14" stroke-linecap="round" />
    <line x1="110" y1="160" x2="110" y2="195" stroke="#3B82F6" stroke-width="14" stroke-linecap="round" />
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "wispr-flow.svg"), wisprCard, "utf8");
  console.log("Generated: wispr-flow.svg");

  // 20. Wordwall
  const wordwallCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="ww-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#2563EB" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#2563EB" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#060F22" />
  <circle cx="256" cy="256" r="230" fill="url(#ww-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#2563EB" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(136, 146)">
    <rect x="0" y="0" width="105" height="105" rx="18" fill="#2563EB" />
    <rect x="125" y="0" width="105" height="105" rx="18" fill="#38BDF8" />
    <rect x="0" y="125" width="105" height="105" rx="18" fill="#F43F5E" />
    <rect x="125" y="125" width="105" height="105" rx="18" fill="#10B981" />
    <text x="52" y="72" font-family="system-ui, sans-serif" font-size="52" font-weight="900" fill="#FFFFFF" text-anchor="middle">W</text>
    <text x="177" y="72" font-family="system-ui, sans-serif" font-size="52" font-weight="900" fill="#FFFFFF" text-anchor="middle">W</text>
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "wordwall.svg"), wordwallCard, "utf8");
  console.log("Generated: wordwall.svg");

  // 21. customer.io
  const customerIoCard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="cio-glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#00D2D3" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#00D2D3" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#03141A" />
  <circle cx="256" cy="256" r="230" fill="url(#cio-glow)" />
  <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#00D2D3" stroke-opacity="0.3" stroke-width="2" />
  <g transform="translate(136, 146)">
    <path d="M120 10 C 60 10 10 55 10 110 C 10 135 20 158 38 175 L 20 215 L 70 200 C 85 206 102 210 120 210 C 180 210 230 165 230 110 C 230 55 180 10 120 10 Z" fill="#00D2D3" />
    <text x="120" y="132" font-family="system-ui, sans-serif" font-size="64" font-weight="900" fill="#03141A" text-anchor="middle">c.io</text>
  </g>
</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, "customer-io.svg"), customerIoCard, "utf8");
  console.log("Generated: customer-io.svg");

  console.log("\nALL 50 DIGITAL PRODUCT LOGOS SUCCESSFULLY GENERATED!");
}

run().catch(console.error);
