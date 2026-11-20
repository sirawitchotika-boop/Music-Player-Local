import test from 'node:test';
import assert from 'node:assert/strict';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.textContent = '';
    this.rawHTML = '';
    this.selectors = new Map();
    this.classList = { add() {}, remove() {} };
  }
  set innerHTML(value) {
    this.rawHTML = value;
    this.children = [];
    this.selectors.clear();
  }
  get innerHTML() { return this.rawHTML; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener() {}
  querySelector(selector) {
    if (!this.selectors.has(selector)) this.selectors.set(selector, new FakeElement(selector));
    return this.selectors.get(selector);
  }
  remove() {}
}

const documentBody = new FakeElement('body');
globalThis.document = {
  body: documentBody,
  createElement: (tag) => new FakeElement(tag),
  getElementById: () => null
};
globalThis.window = { dispatchEvent() {} };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
globalThis.Audio = class { addEventListener() {} };
globalThis.requestAnimationFrame = (callback) => callback();
globalThis.Event = class {};

const { PlaylistUI } = await import('../js/ui/playlistUI.js');
const { ModalUI, modalUI } = await import('../js/ui/modalUI.js');
const { mediaSessionManager } = await import('../js/core/mediaSessionManager.js');
const { storage } = await import('../js/core/storage.js');

const malicious = '<img src=x onerror=alert(1)> " & <script>oops</script>';

test('track filenames render as text, not markup', () => {
  const ui = Object.create(PlaylistUI.prototype);
  ui.playlistContainer = new FakeElement();
  ui.updateActiveHighlight = () => {};
  ui.playTrack = () => {};
  ui.deleteTrack = () => {};
  ui.renderTracks([{ id: 42, name: malicious + '.mp3' }]);
  const item = ui.playlistContainer.children[0];
  assert.equal(item.dataset.id, 42);
  assert.equal(item.querySelector('.track-title-text').textContent, malicious);
  assert.ok(!item.innerHTML.includes(malicious));
});

test('user-defined playlist names and IDs are not inserted into HTML', () => {
  const ui = Object.create(PlaylistUI.prototype);
  ui.dropdownMenu = new FakeElement();
  ui.playlists = [{ id: 'bad" id="oops', name: malicious }];
  ui.renderDropdown();
  const customItem = ui.dropdownMenu.children[2];
  assert.equal(customItem.querySelector('span').textContent, malicious);
  assert.ok(!customItem.innerHTML.includes(malicious));
  assert.ok(!customItem.innerHTML.includes('bad" id="oops'));
  assert.equal(customItem.querySelector('.edit-btn').dataset.id, 'bad" id="oops');
});

test('dialog messages are displayed only as literal text', () => {
  const modal = new ModalUI();
  modal._buildDialog('Delete', malicious, null, '<button>OK</button>', () => {});
  const dialog = documentBody.children.at(-1).children[0];
  const message = dialog.children[1];
  assert.equal(message.textContent, malicious);
  assert.ok(!message.innerHTML.includes(malicious));
});

test('prompt default values cannot inject HTML attributes', async () => {
  const modal = new ModalUI();
  let rawMarkup, input;
  modal._buildDialog = (_title, _text, markup, _actions, init) => {
    rawMarkup = markup;
    input = { type: 'text', value: '', placeholder: '', focus() {}, setSelectionRange() {} };
    const dialog = { querySelector: (selector) => selector === '.gt-modal-input' ? input : { } };
    init(dialog, () => {});
    return Promise.resolve();
  };
  await modal.showPrompt('Rename', malicious, malicious, 'text');
  assert.equal(input.value, malicious);
  assert.equal(input.placeholder, malicious);
  assert.ok(!rawMarkup.includes(malicious));
});

test('double-prompt names cannot inject HTML attributes', async () => {
  const modal = new ModalUI();
  let rawMarkup;
  const first = { value: '', placeholder: '', focus() {}, setSelectionRange() {} };
  const second = { value: '', placeholder: '' };
  modal._buildDialog = (_title, _text, markup, _actions, init) => {
    rawMarkup = markup;
    init({ querySelector: (selector) => selector === '#gt-input-1' ? first : second }, () => {});
    return Promise.resolve();
  };
  await modal.showDoublePrompt('Edit', malicious, malicious, 'minutes', '25');
  assert.equal(first.value, malicious);
  assert.equal(first.placeholder, malicious);
  assert.ok(!rawMarkup.includes(malicious));
  assert.equal(second.value, '25');
});

test('track selection uses stable ID; missing audio and playback errors fail safely', async () => {
  const originalGet = storage.getTrackBlob;
  const originalToast = modalUI.showToast;
  const originalMetadata = mediaSessionManager.updateMetadata;
  const messages = [];
  const played = [];
  storage.getTrackBlob = async (id) => id === 204 ? { id } : null;
  modalUI.showToast = (msg) => messages.push(msg);
  mediaSessionManager.updateMetadata = () => {};
  try {
    const ui = Object.create(PlaylistUI.prototype);
    ui.state = { currentTrackIndex: -1, queue: [{ id: 101 }, { id: 204 }, { id: 305 }] };
    ui.audio = { load: async (blob) => played.push(blob.id), play: async () => played.push('play') };
    await ui.playTrack({ id: 204, name: 'Chosen.mp3' });
    assert.equal(ui.state.currentTrackIndex, 1);
    assert.deepEqual(played, [204, 'play']);

    await ui.playTrack({ id: 305, name: 'Missing.mp3' });
    assert.deepEqual(played, [204, 'play']);
    assert.ok(messages.some(msg => msg.includes('Could not play this song.')));

    ui.audio = { load: async () => { throw new Error('Playback failed'); }, play: async () => played.push('unexpected') };
    await ui.playTrack({ id: 204, name: 'Chosen.mp3' });
    assert.ok(!played.includes('unexpected'));
  } finally {
    storage.getTrackBlob = originalGet;
    modalUI.showToast = originalToast;
    mediaSessionManager.updateMetadata = originalMetadata;
  }
});

test('custom playlist removal and clear never delete underlying audio', async () => {
  const originalDelete = storage.deleteTrack;
  const originalConfirm = modalUI.showConfirm;
  const originalToast = modalUI.showToast;
  let deletions = 0;
  storage.deleteTrack = async () => { deletions++; };
  modalUI.showConfirm = async () => true;
  modalUI.showToast = () => {};
  try {
    const ui = Object.create(PlaylistUI.prototype);
    ui.currentPlaylistId = 'mix';
    ui.playlists = [{ id: 'mix', name: 'My Mix', tracks: [42] }];
    ui.state = { queue: [{ id: 42 }] };
    ui.savePlaylists = () => {};
    ui.loadPlaylist = async () => {};

    await ui.deleteTrack(42);
    assert.deepEqual(ui.playlists[0].tracks, []);
    assert.equal(deletions, 0);

    ui.playlists[0].tracks = [42];
    await ui.handleClearPlaylist();
    assert.deepEqual(ui.playlists[0].tracks, []);
    assert.equal(deletions, 0);
  } finally {
    storage.deleteTrack = originalDelete;
    modalUI.showConfirm = originalConfirm;
    modalUI.showToast = originalToast;
  }
});

test('clearing Favorites removes only favorite entries and preserves all music and other playlists', async () => {
  const originalLocalStorage = globalThis.localStorage;
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const originalDispatch = window.dispatchEvent;
  const originalConfirm = modalUI.showConfirm;
  const originalToast = modalUI.showToast;
  const originalDelete = storage.deleteTrack;
  const values = new Map([['gt_liked_tracks', JSON.stringify([42, 84])]]);
  const messages = [];
  let writes = 0;
  let dispatches = 0;
  let deletions = 0;
  let confirmation;
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes++; values.set(key, String(value)); }
  };
  window.dispatchEvent = () => { dispatches++; };
  storage.deleteTrack = async () => { deletions++; };
  modalUI.showConfirm = async (title, message) => {
    confirmation = { title, message };
    return true;
  };
  modalUI.showToast = message => messages.push(message);
  try {
    const ui = Object.create(PlaylistUI.prototype);
    ui.currentPlaylistId = 'favorites';
    ui.likedTracks = [42, 84];
    ui.state = { queue: [{ id: 42 }, { id: 84 }] };
    ui.playlists = [{ id: 'mix', name: 'My Mix', tracks: [42, 84] }];
    await ui.handleClearPlaylist();

    assert.equal(confirmation.title, 'Clear Favorites?');
    assert.match(confirmation.message, /does not delete music files/i);
    assert.match(confirmation.message, /other playlists/i);
    assert.deepEqual(ui.likedTracks, []);
    assert.deepEqual(JSON.parse(values.get('gt_liked_tracks')), []);
    assert.equal(writes, 1);
    assert.equal(dispatches, 1);
    assert.equal(deletions, 0);
    assert.deepEqual(ui.playlists[0].tracks, [42, 84]);
    assert.ok(messages.some(message => message.includes('music files are safe')));
  } finally {
    storage.deleteTrack = originalDelete;
    modalUI.showConfirm = originalConfirm;
    modalUI.showToast = originalToast;
    window.dispatchEvent = originalDispatch;
    if (hadLocalStorage) globalThis.localStorage = originalLocalStorage;
    else delete globalThis.localStorage;
  }
});

test('cancelling Favorites bulk removal makes no changes', async () => {
  const originalLocalStorage = globalThis.localStorage;
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const originalDispatch = window.dispatchEvent;
  const originalConfirm = modalUI.showConfirm;
  const originalToast = modalUI.showToast;
  const values = new Map([['gt_liked_tracks', JSON.stringify([42])]]);
  let writes = 0;
  let dispatches = 0;
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes++; values.set(key, String(value)); }
  };
  window.dispatchEvent = () => { dispatches++; };
  modalUI.showConfirm = async () => false;
  modalUI.showToast = () => {};
  try {
    const ui = Object.create(PlaylistUI.prototype);
    ui.currentPlaylistId = 'favorites';
    ui.likedTracks = [42];
    ui.state = { queue: [{ id: 42 }] };
    await ui.handleClearPlaylist();
    assert.deepEqual(ui.likedTracks, [42]);
    assert.deepEqual(JSON.parse(values.get('gt_liked_tracks')), [42]);
    assert.equal(writes, 0);
    assert.equal(dispatches, 0);
  } finally {
    modalUI.showConfirm = originalConfirm;
    modalUI.showToast = originalToast;
    window.dispatchEvent = originalDispatch;
    if (hadLocalStorage) globalThis.localStorage = originalLocalStorage;
    else delete globalThis.localStorage;
  }
});

