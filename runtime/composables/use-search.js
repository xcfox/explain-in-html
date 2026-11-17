export function useSearch(Vue, { initial = "" } = {}) {
  const { ref } = Vue;
  const filter = ref(initial);
  function setFilter(v) { filter.value = v == null ? "" : String(v); }
  function clear() { filter.value = ""; }
  return { filter, setFilter, clear };
}
