(() => {
const DB_NAME = 'cca-f-practice';
const DB_VERSION = 1;
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('attempts')) db.createObjectStore('attempts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('active')) db.createObjectStore('active', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function request(storeName, mode, operation) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const result = operation(tx.objectStore(storeName));
    tx.oncomplete = () => { db.close(); resolve(result && result.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  }));
}
const getAttempts = () => request('attempts', 'readonly', store => store.getAll());
const saveAttempt = value => request('attempts', 'readwrite', store => store.put(value));
const saveActive = session => request('active', 'readwrite', store => store.put({ key: 'current', session }));
const getActive = async () => (await request('active', 'readonly', store => store.get('current')))?.session ?? null;
const clearActive = () => request('active', 'readwrite', store => store.delete('current'));
window.CcaDb = { getAttempts, saveAttempt, saveActive, getActive, clearActive };

})();
