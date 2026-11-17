import { getStorage, readJSON, writeJSON, readNumber, writeText } from "../../core/storage.js";

export function usePersistent(Vue, { storage } = {}) {
  const store = storage || getStorage();
  return {
    storage: store,
    readJSON: (key, fb) => readJSON(store, key, fb),
    writeJSON: (key, val) => writeJSON(store, key, val),
    readNumber: (key, fb) => readNumber(store, key, fb),
    writeText: (key, val) => writeText(store, key, val),
  };
}
