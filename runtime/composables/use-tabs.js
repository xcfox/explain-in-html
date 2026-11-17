export function useTabs(Vue, { isOpenable } = {}) {
  const { ref, computed } = Vue;
  const tabs = ref([]);
  const active = ref(null);
  const hasTabs = computed(() => tabs.value.length > 0);

  function open(id) {
    if (isOpenable && !isOpenable(id)) return false;
    if (!id) return false;
    if (!tabs.value.includes(id)) tabs.value = [...tabs.value, id];
    active.value = id;
    return true;
  }
  function close(id) {
    const next = tabs.value.filter(x => x !== id);
    tabs.value = next;
    if (active.value === id) active.value = next[next.length - 1] || null;
  }
  function select(id) {
    if (tabs.value.includes(id)) active.value = id;
  }
  function closeAll() {
    tabs.value = [];
    active.value = null;
  }
  return { tabs, active, hasTabs, open, close, closeAll, select };
}
