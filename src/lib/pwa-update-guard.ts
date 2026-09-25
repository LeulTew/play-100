/**
 * Whether a form holds typed work that a reload would discard. A form that mirrors saved values, such as the account
 * name, declares its own state with data-unsaved="true" or "false"; any other form counts a non-empty text field.
 */
export function hasUnsubmittedPwaForm(root: ParentNode = document): boolean {
  return [...root.querySelectorAll('form')].some((form) => {
    const declared = form.dataset.unsaved;
    if (declared !== undefined) return declared === 'true';
    return [...form.elements].some((element) => {
      if (element instanceof HTMLTextAreaElement) return element.value.length > 0;
      if (!(element instanceof HTMLInputElement)) return false;
      if (element.type === 'file') return Boolean(element.files?.length);
      return (
        [
          'text',
          'email',
          'password',
          'url',
          'tel',
          'number',
          'date',
          'datetime-local',
          'month',
          'week',
          'time',
        ].includes(element.type) && element.value.length > 0
      );
    });
  });
}
