/** API 页注册入口：只聚合显式注册，不在本文件定义组件。 */
import { tag as t1, define as d1 } from "./components/sdl-highlight.js";
import { tag as t2, define as d2 } from "./components/api-type-chip.js";
import { tag as t3, define as d3 } from "./components/api-op-row.js";
import { tag as t4, define as d4 } from "./components/api-type-expand.js";
import { tag as t5, define as d5 } from "./components/api-type-detail.js";
import { tag as t6, define as d6 } from "./components/api-domain-section.js";
import { tag as t7, define as d7 } from "./components/api-toolbar.js";
import { tag as t8, define as d8 } from "./components/eih-tab-strip.js";
import { tag as t9, define as d9 } from "./components/eih-side-pane.js";
import { tag as t10, define as d10 } from "./components/eih-tooltip.js";
import { tag as t11, define as d11 } from "./components/api-explorer.js";

export const API_COMPONENT_MODULES = [
  [t1, d1], [t2, d2], [t3, d3], [t4, d4], [t5, d5], [t6, d6],
  [t7, d7], [t8, d8], [t9, d9], [t10, d10], [t11, d11],
];

export function registerApi(app, Vue) {
  const registered = {};
  for (const [tag, define] of API_COMPONENT_MODULES) {
    const def = define(Vue);
    app.component(tag, def);
    registered[tag] = def;
  }
  return registered;
}
