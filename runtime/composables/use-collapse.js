import { API_COLLAPSE_KEY } from "../../core/storage.js";
import { usePersistent } from "./use-persistent.js";

export function useCollapse(Vue, { key = API_COLLAPSE_KEY, storage } = {}) {
  const { ref } = Vue;
  const persist = usePersistent(Vue, { storage });
  const collapsed = ref(persist.readJSON(key, {}) || {});
  function toggle(id) {
    const next = { ...collapsed.value, [id]: !collapsed.value[id] };
    collapsed.value = next;
    persist.writeJSON(key, next);
  }
  function isClosed(id, forceOpen) {
    return !forceOpen && !!collapsed.value[id];
  }
  return { collapsed, toggle, isClosed };
}
