import { renderToString } from "preact-render-to-string";
import { App } from "../../src/app/App.jsx";

/** Build/test inspection uses the same components as the browser. */
export function appMarkup() {
  return renderToString(<App />);
}
