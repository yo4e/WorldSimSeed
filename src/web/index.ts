export * from "./protocol.js";
export * from "./client.js";
export * from "./service.js";
export * from "./component.js";

import { registerWorldSimElement } from "./component.js";

if (typeof customElements !== "undefined") {
  registerWorldSimElement();
}
