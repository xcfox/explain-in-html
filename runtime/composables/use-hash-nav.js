import { useListeners } from "./use-listeners.js";

/** hashchange 导航。允许读 location.hash；不查询组件内部 DOM。 */
export function useHashNav(Vue, { onHash }) {
  const { onMounted } = Vue;
  const { listen } = useListeners(Vue);

  function read() {
    if (typeof location === "undefined") return "";
    return decodeURIComponent((location.hash || "").replace(/^#/, ""));
  }
  function setHash(name) {
    if (typeof location === "undefined") return;
    const next = name ? "#" + name : "";
    if (location.hash !== next) {
      try { history.replaceState(null, "", next || location.pathname + location.search); }
      catch { location.hash = next; }
    }
  }

  onMounted(() => {
    listen(typeof window !== "undefined" ? window : null, "hashchange", () => onHash && onHash(read()));
    if (onHash) onHash(read());
  });

  return { read, setHash };
}
