// An isolated IndexedDB-shaped fixture. No browser/app database is ever opened.
export class MemoryDB {
  constructor() {
    this.stores = new Map([
      ['audioTracks', new Map()],
      ['audioBlobs', new Map()]
    ]);
    this.nextId = 1;
    this.writes = 0;
  }

  transaction(names, mode = 'readonly') {
    const db = this;
    const allowed = new Set(names);
    const tx = {
      oncomplete: null,
      onerror: null,
      pending: 0,
      objectStore(name) {
        if (!allowed.has(name)) throw new Error(`Unknown store: ${name}`);
        const store = db.stores.get(name);
        if (!store) throw new Error(`Missing store: ${name}`);

        const request = (operation) => {
          const req = { onsuccess: null, onerror: null, result: undefined, error: null };
          tx.pending++;
          queueMicrotask(() => {
            try {
              req.result = operation();
              req.onsuccess?.({ target: req });
            } catch (error) {
              req.error = error;
              req.onerror?.({ target: req });
              tx.onerror?.({ target: { error } });
            } finally {
              tx.pending--;
              if (!tx.pending) {
                queueMicrotask(() => {
                  if (!tx.pending) tx.oncomplete?.();
                });
              }
            }
          });
          return req;
        };

        const writable = () => {
          if (mode !== 'readwrite') throw new Error('Read-only transaction');
          db.writes++;
        };
        return {
          getAll: () => request(() => [...store.values()]),
          get: (id) => request(() => store.get(id)),
          add: (value) => request(() => {
            writable();
            const id = value.id ?? db.nextId++;
            if (store.has(id)) throw new Error('Duplicate ID');
            store.set(id, { ...value, id });
            return id;
          }),
          put: (value) => request(() => {
            writable();
            store.set(value.id, value);
            return value.id;
          }),
          delete: (id) => request(() => {
            writable();
            store.delete(id);
          })
        };
      }
    };
    // IndexedDB also completes a readwrite transaction with no requests
    // (for example, when every imported file was already present).
    queueMicrotask(() => {
      if (!tx.pending) tx.oncomplete?.();
    });
    return tx;
  }
}
