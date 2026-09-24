export function hasUnsubmittedPwaForm(root: ParentNode = document): boolean {
  return [...root.querySelectorAll('form')].some((form) =>
    [...form.elements].some((element) => {
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
    }),
  );
}
