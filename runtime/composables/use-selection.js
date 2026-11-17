export function useSelection(Vue) {
  const { ref } = Vue;
  const selected = ref(null);
  const hot = ref(null);       // 节点名或 null
  const hotEdge = ref(null);   // 边对象或 null
  const focusDomain = ref(null);
  function select(name) { selected.value = name || null; }
  function setHot(name, edge = null) { hot.value = name || null; hotEdge.value = edge || null; }
  function clearHot() { hot.value = null; hotEdge.value = null; }
  function toggleDomain(name) { focusDomain.value = focusDomain.value === name ? null : name; }
  return { selected, hot, hotEdge, focusDomain, select, setHot, clearHot, toggleDomain };
}
