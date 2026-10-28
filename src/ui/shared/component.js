import { Component } from "preact";
import { flushSync } from "preact/compat";

const views = new WeakMap();

/** Application coordinators publish view models; Preact exclusively renders them. */
export class ViewComponent extends Component {
  bind = (element) => {
    if (this.element) views.delete(this.element);
    this.element = element;
    if (element) views.set(element, this);
  };

  shouldComponentUpdate(props, state) {
    return (
      state !== this.state ||
      Object.keys({ ...this.props, ...props }).some((key) => props[key] !== this.props[key])
    );
  }

  update(patch) {
    flushSync(() => this.setState(patch));
  }

  componentWillUnmount() {
    if (this.element) views.delete(this.element);
  }
}

export function viewFor(element) {
  const view = views.get(element);
  if (!view)
    throw new Error(`UI component is not mounted: ${element?.id || "unknown"}`);
  return view;
}
