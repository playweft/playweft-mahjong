import { ViewComponent } from "./component.js";
import { Icon } from "./Icon.jsx";

export class TransientNotice extends ViewComponent {
  state = { message: "", visible: false, shown: false };
  render() {
    return (
      <p
        ref={this.bind}
        id="mahjong-transient-notice"
        class={`mahjong-transient-notice${this.state.shown ? " is-visible" : ""}`}
        role="status"
        aria-live="polite"
        hidden={!this.state.visible}
      >
        {this.state.message}
      </p>
    );
  }
}
