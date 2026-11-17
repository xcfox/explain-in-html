/** ERD 页注册入口：只聚合显式注册，不在本文件定义组件。 */
import { tag as t1, define as d1 } from "./components/ts-highlight.js";
import { tag as t2, define as d2 } from "./components/erd-col-row.js";
import { tag as t3, define as d3 } from "./components/erd-indexes.js";
import { tag as t4, define as d4 } from "./components/erd-types-block.js";
import { tag as t5, define as d5 } from "./components/erd-table-card.js";
import { tag as t6, define as d6 } from "./components/erd-nav.js";
import { tag as t7, define as d7 } from "./components/erd-toolbar.js";
import { tag as t8, define as d8 } from "./components/erd-table-list.js";
import { tag as t9, define as d9 } from "./components/eih-tab-strip.js";
import { tag as t10, define as d10 } from "./components/eih-side-pane.js";
import { tag as t11, define as d11 } from "./components/eih-tooltip.js";
import { tag as t12, define as d12 } from "./components/erd-graph-node.js";
import { tag as t13, define as d13 } from "./components/erd-graph-edge.js";
import { tag as t14, define as d14 } from "./components/erd-graph-hull.js";
import { tag as t15, define as d15 } from "./components/erd-graph-legend.js";
import { tag as t16, define as d16 } from "./components/erd-graph-toolbar.js";
import { tag as t17, define as d17 } from "./components/erd-graph.js";
import { tag as t18, define as d18 } from "./components/erd-explorer.js";

export const ERD_COMPONENT_MODULES = [
  [t1, d1], [t2, d2], [t3, d3], [t4, d4], [t5, d5], [t6, d6],
  [t7, d7], [t8, d8], [t9, d9], [t10, d10], [t11, d11], [t12, d12],
  [t13, d13], [t14, d14], [t15, d15], [t16, d16], [t17, d17], [t18, d18],
];

export function registerErd(app, Vue) {
  const registered = {};
  for (const [tag, define] of ERD_COMPONENT_MODULES) {
    const def = define(Vue);
    app.component(tag, def);
    registered[tag] = def;
  }
  return registered;
}
