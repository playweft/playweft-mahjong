import "./ui/shared/game-storage.css";
import "./styles/base.css";
import "./styles/main.css";
import { render } from "preact";
import { App } from "./app/App.jsx";
import { createMahjongApplication } from "./app/application.js";

render(<App />, document.querySelector("#app-root"));
createMahjongApplication();
