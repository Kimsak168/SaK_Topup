import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { loadTestModules } from '../lib/load-test-module.mjs';

const id = '6ad6452f92d124dc45126343';
const jsonRequest = (path, body, method = 'PATCH') => new Request(`http://localhost${path}`, {
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

// Only persistence and authentication are fixtures. Validation, image decoding,
// upload handlers, public image responses, and their memory cache run unchanged.
function imageFixture(modelName) {
  let stored = null;
  let reads = 0;
  const query = () => ({
    select() { return this; }, maxTimeMS() { return this; },
    async lean() { reads++; return stored ? { ...stored } : null; },
    then(resolve, reject) { return this.lean().then(resolve, reject); },
  });
  const model = {
    create: async fields => (stored = { ...fields, updatedAt: new Date() }),
    findById: query,
    findByIdAndUpdate: (_id, update) => {
      if (stored) stored = { ...stored, ...(update.$set || update), updatedAt: new Date() };
      return query();
    },
    findByIdAndDelete: async () => { const previous = stored; stored = null; return previous; },
  };
  const mocks = {
    'next/server': { NextResponse: Response },
    '@/lib/auth': { requireAdminAuth: async () => ({ authorized: true }) },
    '@/lib/mongodb': { connectDB: async () => {} },
    '@/lib/services/catalogueTiming': { catalogueQuery: (_name, fn) => fn() },
    '@/lib/services/cacheService': { invalidateBannerCache() {}, invalidateCatalogueCache() {} },
    '@/lib/services/blobService': {
      hasBlobToken: () => false,
      uploadToBlob: () => assert.fail('MongoDB uploads must not call Blob storage'),
      safeDeleteBlobIfOrphaned: async () => ({ deleted: false }),
    },
    '@/models/Game': { Game: {} },
    [`@/models/${modelName}`]: { [modelName]: model },
  };
  const load = loadTestModules(mocks, { File, Uint8Array });
  return { load, mocks, get stored() { return stored; }, set stored(value) { stored = value; }, get reads() { return reads; } };
}

test('editing a database banner preserves the uploaded bytes and replacement refreshes the public response', async () => {
  const fixture = imageFixture('Banner');
  const { POST, PATCH } = fixture.load('src/app/api/admin/banners/route.ts');
  const { GET } = fixture.load('src/app/api/banners/[bannerId]/image/route.ts');
  const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#ff0080' } }).png().toBuffer();
  const form = new FormData();
  form.set('title', 'Original banner');
  form.set('image', new File([png], 'banner.png', { type: 'image/png' }));
  assert.equal((await POST(new Request('http://localhost/api/admin/banners', { method: 'POST', body: form }))).status, 201);
  const bannerId = String(fixture.stored._id);
  const url = fixture.stored.imageUrl;
  const bytes = Buffer.from(fixture.stored.imageData);
  const publicImage = imageUrl => GET({ nextUrl: new URL(imageUrl, 'http://localhost') }, { params: Promise.resolve({ bannerId }) });
  assert.equal((await publicImage(url)).status, 200);

  for (const imageUrl of [url, url.split('?')[0], `${url.split('?')[0]}?v=preview-revision`]) {
    const response = await PATCH(jsonRequest('/api/admin/banners', { bannerId, title: 'Edited headline', imageUrl }));
    assert.equal(response.status, 200);
    assert.equal(fixture.stored.imageUrl, url);
    assert.deepEqual(Buffer.from(fixture.stored.imageData), bytes);
    assert.deepEqual(Buffer.from(await (await publicImage(url)).arrayBuffer()), bytes);
  }

  assert.equal((await PATCH(jsonRequest('/api/admin/banners', { bannerId, isActive: false }))).status, 200);
  assert.deepEqual(Buffer.from(fixture.stored.imageData), bytes);
  assert.equal((await PATCH(jsonRequest('/api/admin/banners', { bannerId, imageUrl: 'blob:http://localhost/temporary' }))).status, 400);

  const replacement = new FormData();
  replacement.set('bannerId', bannerId);
  replacement.set('image', new File([await sharp(png).negate().png().toBuffer()], 'new.png', { type: 'image/png' }));
  assert.equal((await PATCH(new Request('http://localhost/api/admin/banners', { method: 'PATCH', body: replacement }))).status, 200);
  assert.notEqual(fixture.stored.imageUrl, url);
  assert.notDeepEqual(Buffer.from(fixture.stored.imageData), bytes);
  const refreshed = await publicImage(fixture.stored.imageUrl);
  assert.deepEqual(Buffer.from(await refreshed.arrayBuffer()), Buffer.from(fixture.stored.imageData));
  assert.match(refreshed.headers.get('cache-control'), /immutable/);
});

test('saving package prices or the same image URL preserves bytes; explicit removal clears them', async () => {
  const fixture = imageFixture('GamePackage');
  fixture.stored = { _id: id, sellingPrice: 5, supplierProductCode: 'unchanged', customImage: null };
  const { POST, DELETE } = fixture.load('src/app/api/admin/packages/upload/route.ts');
  const { PATCH } = fixture.load('src/app/api/admin/packages/route.ts');
  const { GET } = fixture.load('src/app/api/packages/[packageId]/image/route.ts');
  const form = new FormData();
  form.set('packageId', id);
  form.set('image', new File([await sharp({ create: { width: 8, height: 8, channels: 4, background: '#0080ff' } }).png().toBuffer()], 'package.png', { type: 'image/png' }));
  assert.equal((await POST(new Request('http://localhost/api/admin/packages/upload', { method: 'POST', body: form }))).status, 200);
  const url = fixture.stored.customImage;
  const bytes = Buffer.from(fixture.stored.imageData);
  for (const customImage of [url, `${url.split('?')[0]}?v=preview-revision`]) {
    assert.equal((await PATCH(jsonRequest('/api/admin/packages', { packageId: id, sellingPrice: 6, customImage }))).status, 200);
    assert.deepEqual(Buffer.from(fixture.stored.imageData), bytes);
    assert.equal(fixture.stored.customImage, url);
    assert.equal((await POST(jsonRequest('/api/admin/packages/upload', { packageId: id, imageUrl: customImage }, 'POST'))).status, 200);
    assert.deepEqual(Buffer.from(fixture.stored.imageData), bytes);
    assert.equal(fixture.stored.customImage, url);
  }
  assert.equal(fixture.stored.sellingPrice, 6);
  assert.equal(fixture.stored.supplierProductCode, 'unchanged');
  const publicImage = () => GET({ nextUrl: new URL(url, 'http://localhost') }, { params: Promise.resolve({ packageId: id }) });
  assert.deepEqual(Buffer.from(await (await publicImage()).arrayBuffer()), bytes);

  const invalid = new FormData();
  invalid.set('packageId', id);
  invalid.set('image', new File(['invalid'], 'broken.png', { type: 'image/png' }));
  assert.equal((await POST(new Request('http://localhost/api/admin/packages/upload', { method: 'POST', body: invalid }))).status, 400);
  assert.deepEqual(Buffer.from(fixture.stored.imageData), bytes);

  assert.equal((await DELETE(jsonRequest('/api/admin/packages/upload', { packageId: id }, 'DELETE'))).status, 200);
  assert.equal(fixture.stored.imageData, null);
  assert.equal(fixture.stored.customImage, null);
  const removed = await publicImage();
  assert.equal(removed.status, 404);
  assert.equal(removed.headers.get('cache-control'), 'no-store');
});

test('package uploads reject missing or empty pictures instead of reporting a successful save', async () => {
  const fixture = imageFixture('GamePackage');
  fixture.stored = { _id: id, sellingPrice: 5, supplierProductCode: 'hok-16', customImage: null };
  const { POST } = fixture.load('src/app/api/admin/packages/upload/route.ts');
  const requests = [
    jsonRequest('/api/admin/packages/upload', { packageId: id }, 'POST'),
    jsonRequest('/api/admin/packages/upload', null, 'POST'),
  ];
  for (const field of [null, 'image']) {
    const form = new FormData();
    form.set('packageId', id);
    if (field) form.set(field, new File([], 'empty.png', { type: 'image/png' }));
    requests.push(new Request('http://localhost/api/admin/packages/upload', { method: 'POST', body: form }));
  }
  for (const request of requests) {
    const response = await POST(request);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
  }
  assert.equal(fixture.reads, 0, 'Invalid uploads must fail before reading or updating a package');
  assert.equal(fixture.stored.customImage, null);
});

test('package uploads accept the file field used by older upload forms', async () => {
  const fixture = imageFixture('GamePackage');
  fixture.stored = { _id: id, sellingPrice: 5, supplierProductCode: 'hok-16', customImage: null };
  const { POST } = fixture.load('src/app/api/admin/packages/upload/route.ts');
  const form = new FormData();
  form.set('packageId', id);
  form.set('file', new File([await sharp({ create: { width: 8, height: 8, channels: 4, background: '#ff0080' } }).png().toBuffer()], 'tokens.png', { type: 'image/png' }));
  assert.equal((await POST(new Request('http://localhost/api/admin/packages/upload', { method: 'POST', body: form }))).status, 200);
  assert.match(fixture.stored.customImage, /^\/api\/packages\//);
  assert.ok(fixture.stored.imageData.byteLength > 0);
});

for (const [model, path, param, field] of [
  ['Banner', 'banners', 'bannerId', 'imageUrl'],
  ['GamePackage', 'packages', 'packageId', 'customImage'],
  ['GameEvent', 'game-events', 'eventId', 'imageUrl'],
]) {
  test(`${path} image cache refreshes after uploads handled by another server and deduplicates reads`, async () => {
    const fixture = imageFixture(model);
    const { GET } = fixture.load(`src/app/api/${path}/[${param}]/image/route.ts`);
    const request = version => GET({ nextUrl: new URL(`http://localhost/api/${path}/${id}/image?v=${version}`) }, { params: Promise.resolve({ [param]: id }) });
    fixture.stored = { imageData: Buffer.from('old'), imageContentType: 'image/png', [field]: `/api/${path}/${id}/image?v=old`, updatedAt: new Date(1000) };
    assert.equal(await (await request('old')).text(), 'old');
    // No local invalidation: a different function processed the replacement.
    fixture.stored = { ...fixture.stored, imageData: Buffer.from('new'), [field]: `/api/${path}/${id}/image?v=new`, updatedAt: new Date(2000) };
    const responses = await Promise.all([request('new'), request('new'), request('new')]);
    for (const response of responses) {
      assert.equal(await response.text(), 'new');
      assert.match(response.headers.get('cache-control'), /immutable/);
    }
    assert.equal(fixture.reads, 2);
    assert.equal((await request('new')).headers.get('x-image-cache'), 'HIT');
    assert.equal(fixture.reads, 2);
  });
}

test('image memory cache respects its byte budget, retains recently used images, and expires unversioned previews', () => {
  let now = 1000;
  class Clock extends Date { static now() { return now; } }
  const load = loadTestModules({}, { Uint8Array, URLSearchParams, Date: Clock });
  const { setCachedLegacyImage: set, getCachedLegacyImage: get, invalidateLegacyImage: invalidate } = load('src/lib/services/legacyImageService.ts');
  const image = { bytes: new Uint8Array(12 * 1024 * 1024), contentType: 'image/png' };
  set('one', image, 'v1');
  set('two', image, 'v1');
  assert.ok(get('one', 'v1'));
  set('three', image, 'v1');
  assert.equal(get('two', 'v1'), null);
  assert.ok(get('one', 'v1'));
  assert.ok(get('three', 'v1'));
  assert.equal(get('one', 'v2'), null);
  for (let i = 0; i < 10; i++) set('three', image, 'v1');
  assert.ok(get('one', 'v1'), 'Replacing one entry must release its old byte count');
  invalidate('one');
  assert.equal(get('one', 'v1'), null);
  set('preview', { bytes: new Uint8Array(1), contentType: 'image/png' });
  now += 61_000;
  assert.equal(get('preview'), null);
  assert.ok(get('three', 'v1'));
});

test('upload revisions stay stable across metadata edits and older unversioned URLs receive a deterministic revision', () => {
  const { versionImageUrl } = loadTestModules()('src/lib/blob-shared.ts');
  const url = `/api/packages/${id}/image?v=upload-id`;
  assert.equal(versionImageUrl(url, new Date(1000)), url);
  assert.equal(versionImageUrl(url, new Date(2000)), url);
  assert.equal(versionImageUrl(url.split('?')[0], new Date(1000)), `${url.split('?')[0]}?v=1000`);
  assert.equal(versionImageUrl(url.split('?')[0], 'invalid'), url.split('?')[0]);
  assert.equal(versionImageUrl('https://example.com/art.png', new Date(1000)), 'https://example.com/art.png');
});

test('admin uploads bypass the server before multipart limits and do not delete existing images before saving', async () => {
  const calls = [];
  const load = loadTestModules({
    '@vercel/blob/client': { upload: async (pathname, file) => {
      calls.push({ method: 'direct', size: file.size });
      return { url: 'https://store.public.blob.vercel-storage.com/new.png', pathname };
    } },
  }, { File, fetch: async (_url, options) => {
    calls.push({ method: options.method, replaceUrl: options.body.get('replaceUrl') });
    return Response.json({ success: true, url: 'https://store.public.blob.vercel-storage.com/small.png', pathname: 'banners/small.png' });
  } });
  const { uploadAdminImage } = load('src/lib/clientBlobUpload.ts');
  await uploadAdminImage(new File(['small'], 'small.png', { type: 'image/png' }), 'banners');
  await uploadAdminImage(new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }), 'banners');
  assert.deepEqual(calls, [{ method: 'POST', replaceUrl: null }, { method: 'direct', size: 4 * 1024 * 1024 + 1 }]);
});

test('upload optimization reduces large artwork while retaining transparency and display dimensions', async () => {
  const { readBannerImage } = loadTestModules({}, { File })('src/lib/bannerUpload.ts');
  const source = await sharp({ create: { width: 2400, height: 1800, channels: 4, background: '#ff008080' } }).png().toBuffer();
  const optimized = await readBannerImage(new File([source], 'artwork.png', { type: 'image/png' }));
  const metadata = await sharp(optimized.imageData).metadata();
  assert.ok(optimized.imageData.byteLength < source.byteLength);
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 1200);
  assert.equal(metadata.hasAlpha, true);
});
