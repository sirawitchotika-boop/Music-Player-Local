import test from 'node:test';
import assert from 'node:assert/strict';
import { storage } from '../js/core/storage.js';
import { MemoryDB } from './memory-db.mjs';

test('import stores original audio and stable ID without overwriting duplicates', async () => {
  const db = new MemoryDB();
  storage.db = db;
  const file = { name: 'My Song.mp3', type: 'audio/mpeg', size: 123 };
  const first = await storage.saveFiles([file]);
  assert.equal(first.count, 1);
  assert.equal(first.skipped, 0);
  const track = first.processedTracks[0].track;
  assert.equal(typeof track.id, 'number');
  assert.strictEqual(await storage.getTrackBlob(track.id), file);

  const second = await storage.saveFiles([file]);
  assert.equal(second.count, 0);
  assert.equal(second.skipped, 1);
  assert.equal(second.processedTracks[0].track.id, track.id);
  assert.deepEqual((await storage.getAllTracks()).map(t => t.id), [track.id]);
  assert.strictEqual(await storage.getTrackBlob(track.id), file);
});

test('library reads and missing-track lookup never modify audio stores', async () => {
  const db = new MemoryDB();
  storage.db = db;
  const file = { name: 'Only Copy.flac', type: 'audio/flac', size: 56 };
  const { processedTracks } = await storage.saveFiles([file]);
  const id = processedTracks[0].track.id;
  const writesBefore = db.writes;
  assert.equal((await storage.getAllTracks())[0].id, id);
  assert.strictEqual(await storage.getTrackBlob(id), file);
  assert.equal(await storage.getTrackBlob(999999), null);
  assert.equal(db.writes, writesBefore);
  assert.equal(db.stores.get('audioTracks').size, 1);
  assert.equal(db.stores.get('audioBlobs').size, 1);
});

test('legacy in-record blob still loads when separate audio blob is absent', async () => {
  const db = new MemoryDB();
  storage.db = db;
  const oldBlob = { name: 'Old Song.mp3', size: 10 };
  db.stores.get('audioTracks').set(42, { id: 42, name: 'Old Song.mp3', blob: oldBlob });
  assert.strictEqual(await storage.getTrackBlob(42), oldBlob);
  assert.equal(db.writes, 0);
});

test('empty or unsupported imports do not delete existing audio', async () => {
  const db = new MemoryDB();
  storage.db = db;
  const original = { name: 'Safe.mp3', type: 'audio/mpeg', size: 10 };
  const { processedTracks } = await storage.saveFiles([original]);
  await assert.rejects(storage.saveFiles([{ name: 'notes.txt', type: 'text/plain', size: 10 }]));
  assert.strictEqual(await storage.getTrackBlob(processedTracks[0].track.id), original);
});
