import test from "node:test";
import assert from "node:assert/strict";
import { loadTestModules } from "../lib/load-test-module.mjs";

function fixture() {
  let reads = 0;
  let fail = false;
  let output;
  const document = { createElement: () => {
    let pixels;
    return {
      getContext: () => ({
        drawImage: image => { pixels = new Uint8ClampedArray(image.pixels); },
        getImageData: () => { reads++; if (fail) throw new Error("Unreadable image"); return { data: pixels }; },
        putImageData: image => { pixels = image.data; },
      }),
      toDataURL: () => output ?? JSON.stringify([...pixels]),
    };
  } };
  const { removeWhiteBackground } = loadTestModules({}, { document })("src/lib/packageArtwork.ts");
  const image = (revision = 1, white = true) => ({
    currentSrc: `/api/packages/fixture/image?v=${revision}`,
    naturalWidth: 3, naturalHeight: 3,
    pixels: Array.from({ length: 9 }, (_, index) => white && index !== 4 ? [255, 255, 255, 255] : [255, 0, 0, 255]).flat(),
  });
  return { process: removeWhiteBackground, image, reads: () => reads,
    fail: value => { fail = value; }, output: value => { output = value; } };
}

test("shared artwork preserves foreground pixels and removes exactly the original white border", () => {
  const f = fixture();
  const cache = new Map();
  const result = f.process(f.image(), cache);
  const expected = Array.from({ length: 9 }, (_, index) => index === 4 ? [255, 0, 0, 255] : [0, 0, 0, 0]).flat();
  assert.deepEqual(JSON.parse(result), expected);
  assert.equal(f.process(f.image(), cache), result);
  assert.equal(f.reads(), 1, "Two cards share one pixel read");
});

test("new image revisions, resolutions and package lists cannot reuse old processed artwork", () => {
  const f = fixture();
  const cache = new Map();
  f.process(f.image(), cache);
  f.process(f.image(2), cache);
  const resized = f.image();
  resized.naturalWidth = 1;
  resized.naturalHeight = 9;
  f.process(resized, cache);
  f.process(f.image(), new Map());
  assert.equal(f.reads(), 4);
});

test("images without a white border retain their pixels and skip repeated processing", () => {
  const f = fixture();
  const cache = new Map();
  assert.equal(f.process(f.image(1, false), cache), null);
  assert.equal(f.process(f.image(1, false), cache), null);
  assert.equal(f.reads(), 1);
});

test("unreadable images can retry and oversized results do not occupy the artwork cache", () => {
  const f = fixture();
  const cache = new Map();
  f.fail(true);
  assert.equal(f.process(f.image(), cache), null);
  f.fail(false);
  assert.ok(f.process(f.image(), cache));
  assert.equal(f.reads(), 2);
  f.output("x".repeat(65_537));
  f.process(f.image(2), cache);
  f.process(f.image(2), cache);
  assert.equal(f.reads(), 4);
  for (let revision = 3; revision < 40; revision++) f.process(f.image(revision, false), cache);
  assert.equal(cache.size, 32, "The cache stays bounded as images change");
});
