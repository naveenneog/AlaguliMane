// v1.8 α1 — guards the AM optional-language text packs (hi/ta/te/ml/mr) through the shared language-pack
// validators + the bundled web schema: trusted index, manifest hash-addressing, canonical payload
// identity, and byte-for-byte fidelity to the repackaged source catalogs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  validateLanguageIndex, validateLanguageManifest, validateLanguagePackSchema, hashLanguageManifest,
  voiceContentId,
} from '../web/js/language-pack.js';

const WEB = fileURLToPath(new URL('../web/', import.meta.url));
const rawSha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readBytes = (relative) => readFile(`${WEB}${relative}`);
const readJson = async (relative) => JSON.parse((await readBytes(relative)).toString('utf8'));
const OPTIONAL = ['hi', 'ta', 'te', 'ml', 'mr'];
const VOICE_SCOPES = ['malnad', 'parampare', 'suggi', 'ulita', 'ui'];

test('AM trusted language index validates and keeps kn/en core', async () => {
  const index = await readJson('packs/am/language-index.json');
  assert.equal(validateLanguageIndex(index, { game: 'am' }), true);
  assert.deepEqual(index.coreLanguages, ['kn', 'en']);
  assert.equal(index.defaultLanguage, 'en');
  for (const language of OPTIONAL) {
    assert.ok(
      index.packs.some((pack) => pack.language === language && pack.component === 'text'),
      `${language} text pack present`,
    );
  }
});

test('AM index lists a voice pack per optional language', async () => {
  const index = await readJson('packs/am/language-index.json');
  for (const language of OPTIONAL) {
    assert.ok(
      index.packs.some((pack) => pack.language === language && pack.component === 'voice'),
      `${language} voice pack present`,
    );
  }
});

for (const language of OPTIONAL) {
  test(`AM ${language} voice manifest is hash-addressed, schema-valid, and 1:1 with its voice files`, async () => {
    const index = await readJson('packs/am/language-index.json');
    const entry = index.packs.find((pack) =>
      pack.language === language && pack.component === 'voice');
    const manifestBytes = await readBytes(entry.manifestPath);
    assert.equal(rawSha(manifestBytes), entry.manifestSha256);
    assert.equal(manifestBytes.byteLength, entry.manifestBytes);

    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const schema = await readJson('schemas/v1.8/language-pack.schema.json');
    assert.equal(validateLanguagePackSchema(schema, manifest), true);
    assert.equal(validateLanguageManifest(manifest, { game: 'am', entry }), true);
    assert.equal(manifest.component, 'voice');
    assert.equal(manifest.fallbackLanguage, null);

    const payloadHash = await hashLanguageManifest(manifest);
    assert.equal(payloadHash, manifest.sha256);
    assert.equal(payloadHash, entry.packSha256);

    let total = 0;
    for (const file of manifest.files) {
      const bytes = await readBytes(file.path);
      total += bytes.byteLength;
      assert.equal(bytes.byteLength, file.bytes, `${file.path} byte count`);
      assert.equal(rawSha(bytes), file.sha256, `${file.path} sha256`);
    }
    assert.equal(total, manifest.bytes);
    assert.equal(total, entry.packBytes);

    const voiceManifestFile = manifest.files.find((file) => file.role === 'voice-manifest');
    const voiceMap = await readJson(voiceManifestFile.path);
    const voices = manifest.files.filter((file) => file.role === 'voice');
    assert.equal(Object.keys(voiceMap).length, voices.length);
    for (const voice of voices) {
      assert.equal(voiceMap[voice.contentId], voice.path, `voice-manifest maps ${voice.contentId}`);
    }
  });

  test(`AM ${language} voice content ids are scoped and derivable from source voice.json`, async () => {
    const index = await readJson('packs/am/language-index.json');
    const entry = index.packs.find((pack) =>
      pack.language === language && pack.component === 'voice');
    const manifest = await readJson(entry.manifestPath);
    const voiceManifestFile = manifest.files.find((file) => file.role === 'voice-manifest');
    const voiceMap = await readJson(voiceManifestFile.path);
    for (const scope of VOICE_SCOPES) {
      const source = await readJson(`assets/${scope}/voice/${language}/voice.json`);
      for (const text of Object.keys(source)) {
        const contentId = await voiceContentId(scope, text);
        assert.ok(contentId in voiceMap, `${scope} clip content id present in voice-manifest`);
      }
    }
  });
}

for (const language of OPTIONAL) {
  test(`AM ${language} text manifest is hash-addressed, schema-valid, and cross-file consistent`, async () => {
    const index = await readJson('packs/am/language-index.json');
    const entry = index.packs.find((pack) =>
      pack.language === language && pack.component === 'text');
    const manifestBytes = await readBytes(entry.manifestPath);
    assert.equal(rawSha(manifestBytes), entry.manifestSha256);
    assert.equal(manifestBytes.byteLength, entry.manifestBytes);

    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const schema = await readJson('schemas/v1.8/language-pack.schema.json');
    assert.equal(validateLanguagePackSchema(schema, manifest), true);
    assert.equal(validateLanguageManifest(manifest, { game: 'am', entry }), true);

    const payloadHash = await hashLanguageManifest(manifest);
    assert.equal(payloadHash, manifest.sha256);
    assert.equal(payloadHash, entry.packSha256);

    let total = 0;
    for (const file of manifest.files) {
      const bytes = await readBytes(file.path);
      total += bytes.byteLength;
      assert.equal(bytes.byteLength, file.bytes, `${file.path} byte count`);
      assert.equal(rawSha(bytes), file.sha256, `${file.path} sha256`);
    }
    assert.equal(total, manifest.bytes);
    assert.equal(total, entry.packBytes);
  });

  test(`AM ${language} pack repackages the existing catalogs byte-for-byte`, async () => {
    const index = await readJson('packs/am/language-index.json');
    const entry = index.packs.find((pack) =>
      pack.language === language && pack.component === 'text');
    const manifest = await readJson(entry.manifestPath);
    assert.equal(
      rawSha(await readBytes(`packs/am/${language}/1/ui.json`)),
      rawSha(await readBytes(`assets/ui/${language}.json`)),
    );
    for (const file of manifest.files.filter(({ role }) => role === 'world')) {
      const world = file.path.match(/world-([a-z0-9-]+)\.json$/)[1];
      assert.equal(
        rawSha(await readBytes(file.path)),
        rawSha(await readBytes(`assets/${world}/i18n/${language}.json`)),
        `${world} catalog`,
      );
    }
  });
}
