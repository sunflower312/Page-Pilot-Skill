export function browserReadAssertionText(element) {
  const tagName = element?.tagName?.toLowerCase?.() ?? '';
  if (tagName === 'input' || tagName === 'textarea') {
    return { text: element.value, source: 'value' };
  }
  if (tagName === 'select') {
    return {
      text: Array.from(element.selectedOptions)
        .map((option) => option.label || option.textContent || option.value || '')
        .join(' ')
        .trim(),
      source: 'selectedText',
    };
  }
  return { text: element.textContent ?? '', source: 'textContent' };
}
