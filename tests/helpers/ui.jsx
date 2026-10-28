import { render } from "preact";
import { App } from "../../src/app/App.jsx";
export { appMarkup } from "../../build/ui/markup.jsx";

export function mountUi(document) {
  render(<App />, document.body);
  return () => render(null, document.body);
}
