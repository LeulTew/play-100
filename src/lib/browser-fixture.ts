export function fixtureElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Browser fixture element #${id} is missing.`);
  return element;
}
