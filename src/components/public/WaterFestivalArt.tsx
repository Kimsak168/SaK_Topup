function Lotus({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cy="13" rx="30" ry="5" fill="#487B80" opacity=".14" />
      <path d="M-25 7Q0-3 25 7Q3 22-25 7" fill="#819D8B" />
      <path d="M0 9Q-29 7-24-12Q-9-11 0 9" fill="#E89CAE" />
      <path d="M0 9Q29 7 24-12Q9-11 0 9" fill="#E89CAE" />
      <path d="M0 9Q-19-2-11-26Q2-18 0 9" fill="#F4BFCC" />
      <path d="M0 9Q19-2 11-26Q-2-18 0 9" fill="#F4BFCC" />
      <path d="M0 9Q-10-12 0-33Q10-12 0 9" fill="#FFF1DD" />
      <circle cy="4" r="3.5" fill="#C79749" />
    </g>
  );
}

function Prateep({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cy="21" rx="29" ry="5" fill="#CC9C53" opacity=".19" />
      <circle cy="-5" r="20" fill="#F7DAA1" opacity=".32" />
      <path d="M-22 9Q0 17 22 9L13 20H-13Z" fill="#C28C42" />
      <path d="M-17 7L-9-5L0 5L9-5L17 7L0 14Z" fill="#F0BF79" />
      <path d="M-3 4V-8H3V4" fill="#FFF8DB" />
      <path d="M0-9Q-7-14 0-24Q7-14 0-9" fill="#EAA45A" />
      <path d="M0-10Q-3-14 0-18Q3-14 0-10" fill="#FFF9D8" />
    </g>
  );
}

/** Decorative Bon Om Touk scene, drawn locally with no image requests. */
export function WaterFestivalArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 560 410" fill="none" aria-hidden="true" focusable="false">
      {/* The full moon and its warm, reflected light. */}
      <circle cx="306" cy="104" r="94" fill="#E9CA91" opacity=".13" />
      <circle cx="306" cy="104" r="73" fill="#EBCF9F" opacity=".2" />
      <circle cx="306" cy="104" r="54" fill="#FFF6D8" stroke="#E1BF82" strokeWidth="1.5" />
      <path d="M282 71Q260 95 280 124" stroke="#EAD5AA" strokeWidth="2" strokeLinecap="round" />
      <circle cx="327" cy="89" r="8" fill="#EEDCB4" opacity=".65" />
      <circle cx="314" cy="124" r="5" fill="#EEDCB4" opacity=".6" />

      {/* Small stars and hanging festival lights. */}
      <g stroke="#BD914B" strokeWidth="1.5" strokeLinecap="round">
        <path d="M112 116v12m-6-6h12M404 96v10m-5-5h10M440 179v10m-5-5h10M216 53v9m-4.5-4.5h9" />
        <path d="M140 0v47M451 0v48M494 0v114" opacity=".45" />
      </g>
      <g fill="#E8BB78" stroke="#BD914B" strokeWidth="1.2">
        <path d="M128 51q12-8 24 0v24q-12 8-24 0Z" />
        <path d="M440 52q11-7 22 0v24q-11 7-22 0Z" />
        <path d="M485 117q9-6 18 0v19q-9 6-18 0Z" />
      </g>
      <g stroke="#FFF1CD" strokeWidth="2" strokeLinecap="round">
        <path d="M140 52v23M451 54v21M494 119v16" />
      </g>
      <g stroke="#BD914B" strokeWidth="1.2" strokeLinecap="round">
        <path d="M140 81v10m-4-5v4m8-4v4M451 82v10m-4-5v4m8-4v4M494 142v8" />
      </g>
      <g fill="#C49B5F">
        <circle cx="190" cy="111" r="2" /><circle cx="380" cy="40" r="2" />
        <circle cx="472" cy="204" r="2" /><circle cx="95" cy="184" r="2" />
      </g>

      {/* Layered river ripples. */}
      <path d="M24 252Q114 217 216 245T425 239Q492 227 541 256L532 346Q285 416 29 344Z" fill="#DEEAE5" />
      <path d="M24 279Q118 246 226 273T436 266Q497 252 538 277L528 346Q287 401 32 344Z" fill="#BDD6D1" />
      <path d="M30 315Q126 282 241 309T442 297Q497 286 535 311L528 346Q287 401 32 344Z" fill="#9ABEB8" opacity=".67" />
      <g stroke="#FAF5E9" strokeWidth="2" strokeLinecap="round" opacity=".8">
        <path d="M58 281q40-12 80-4M216 283q56 16 109 5M375 318q49-14 104-5M83 340q54-9 93 2M224 353q46 8 91-1" />
      </g>
      <g stroke="#D9B472" strokeWidth="2" strokeLinecap="round" opacity=".65">
        <path d="M276 192h60M267 202h73M287 213h38" />
      </g>

      {/* A long racing boat, with rowers and ceremonial golden prow. */}
      <path d="M76 243Q236 267 444 223Q414 270 304 282Q153 292 76 243Z" fill="#8F3D5B" />
      <path d="M79 244Q249 267 439 225" stroke="#E1B76C" strokeWidth="5" strokeLinecap="round" />
      <path d="M113 264Q263 288 402 248" stroke="#EAC489" strokeWidth="2" strokeDasharray="5 7" />
      <path d="M435 227Q443 210 433 189Q428 176 442 165L458 159L450 175Q459 183 453 193Q446 205 445 226Z" fill="#C38F45" />
      <path d="M442 165L450 151L452 164L463 162L454 174" fill="#AC4663" />
      <circle cx="448" cy="174" r="2" fill="#533B3A" />
      <path d="M441 188q5 4 10 0M440 201l8 1" stroke="#F7D799" strokeWidth="1.5" />
      {[137, 174, 211, 248, 285, 322, 359].map((x, index) => {
        const y = 238 - index * 1.8;
        return (
          <g key={x}>
            <circle cx={x} cy={y - 27} r="5" fill="#9A6E55" />
            <path d={`M${x - 6} ${y - 19}q6-5 12 0l3 16h-18Z`} fill={index % 2 ? "#F1DDAD" : "#557B79"} />
            <path d={`M${x - 5} ${y - 12}l19 10m-1-4l-24 51`} stroke="#846341" strokeWidth="2.4" strokeLinecap="round" />
            <path d={`M${x - 9} ${y + 35}l-6 13q-1 5 3 5l9-14Z`} fill="#C3985C" />
          </g>
        );
      })}
      <path d="M76 243l-15-16l27 11" fill="#C38F45" />

      <Lotus x={91} y={317} scale={.9} />
      <Lotus x={411} y={350} scale={1.05} />
      <Lotus x={495} y={288} scale={.6} />
      <Prateep x={188} y={348} scale={.75} />
      <Prateep x={466} y={335} scale={.6} />
      <Prateep x={384} y={292} scale={.55} />
    </svg>
  );
}
