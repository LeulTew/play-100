import { createElement as h } from 'react';

/** Stands in for cloud/OnlineController: records each render and the URL it read, as the controller reads ?group=. */
export default function OnlineController() {
  window.onlineRouteFixture.renders.push(location.search);
  return h('p', { id: 'online-url' }, location.search || 'none');
}
