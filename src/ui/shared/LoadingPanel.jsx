import { ViewComponent } from "./component.js";
import { Icon } from "./Icon.jsx";

export class LoadingPanel extends ViewComponent {
  state = {};
  render() {
    return (
      <section
        ref={this.bind}
        id="loading-panel"
        class="loading-panel"
        role="status"
        aria-label="正在洗牌并码好牌山"
        hidden
      >
        <div class="loading-card" aria-hidden="true">
          <span class="loading-spinner"></span>
        </div>
        <p id="loading-message" hidden></p>
      </section>
    );
  }
}
