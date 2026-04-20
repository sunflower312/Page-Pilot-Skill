export function toPlaywrightExpression(locator = {}, { pageAlias = 'page', quote = JSON.stringify } = {}) {
  if (locator.strategy === 'role') {
    const exact = locator.value?.exact !== false ? 'true' : 'false';
    return `${pageAlias}.getByRole(${quote(locator.value.role)}, { name: ${quote(locator.value.name)}, exact: ${exact} })`;
  }

  if (locator.strategy === 'label') {
    return `${pageAlias}.getByLabel(${quote(locator.value)})`;
  }

  if (locator.strategy === 'text') {
    return `${pageAlias}.getByText(${quote(locator.value)}, { exact: true })`;
  }

  if (locator.strategy === 'placeholder') {
    return `${pageAlias}.getByPlaceholder(${quote(locator.value)})`;
  }

  if (locator.strategy === 'testId') {
    return `${pageAlias}.getByTestId(${quote(locator.value)})`;
  }

  return `${pageAlias}.locator(${quote(locator.value)})`;
}
