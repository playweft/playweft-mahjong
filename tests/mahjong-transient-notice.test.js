import { Window } from "happy-dom";
import { mountUi } from "./helpers/ui.jsx";
import assert from "node:assert/strict";
import { test } from "node:test";

import { createMahjongTransientNotice } from "../src/ui/shared/transient-notice.js";

test("mahjong transient notices replace an earlier message and hide after the latest timeout", () => {
  const timers = [];
  const browser = new Window();
  mountUi(browser.document);
  const element = browser.document.querySelector("#mahjong-transient-notice");
  const window = {
    setTimeout(callback) {
      const timer = { callback, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
  };
  const notice = createMahjongTransientNotice({
    element,
    window,
    duration: 1,
    transitionDuration: 1,
  });

  notice.show("first");
  notice.show("instruction quota exceeded");
  assert.equal(element.textContent, "instruction quota exceeded");
  assert.equal(element.hidden, false);
  assert.equal(element.classList.contains("is-visible"), true);
  assert.equal(timers[0].cleared, true);

  timers[1].callback();
  timers[2].callback();
  assert.equal(element.hidden, true);
  void browser.happyDOM.close();
});
