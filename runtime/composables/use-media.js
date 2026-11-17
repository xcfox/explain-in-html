import { useListeners } from "./use-listeners.js";

/** 视口宽度与 matchMedia 订阅；卸载时移除监听。测量用 innerWidth / matchMedia，不查询组件树。 */
export function useMedia(Vue, { getWidth } = {}) {
  const { ref, onMounted } = Vue;
  const { listen } = useListeners(Vue);
  const widthOf = () => {
    if (typeof getWidth === "function") return getWidth();
    return typeof innerWidth === "number" ? innerWidth : 1200;
  };
  const viewport = ref(widthOf());
  const dark = ref(typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches);

  onMounted(() => {
    viewport.value = widthOf();
    listen(typeof window !== "undefined" ? window : null, "resize", () => { viewport.value = widthOf(); });
    if (typeof matchMedia === "function") {
      const mq = matchMedia("(prefers-color-scheme: dark)");
      dark.value = mq.matches;
      const on = ev => { dark.value = ev.matches; };
      if (typeof mq.addEventListener === "function") listen(mq, "change", on);
      else if (typeof mq.addListener === "function") {
        mq.addListener(on);
        listen({ addEventListener() {}, removeEventListener() { try { mq.removeListener(on); } catch {} } }, "noop", () => {});
      }
    }
  });

  return { viewport, dark };
}
