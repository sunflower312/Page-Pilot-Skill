function pushCandidate(candidates, strategy, value) {
  if (!value) {
    return;
  }
  const metadataByStrategy = {
    role: { stability: 'high', reason: 'Accessible role/name pair' },
    label: { stability: 'high', reason: 'Associated form label' },
    text: { stability: 'medium', reason: 'Visible text content' },
    placeholder: { stability: 'medium', reason: 'Placeholder text' },
    testId: { stability: 'high', reason: 'Explicit test identifier' },
    css: { stability: 'low', reason: 'CSS fallback' },
  };

  candidates.push({ strategy, value, ...metadataByStrategy[strategy] });
}

export function buildLocatorCandidates(element = {}) {
  const candidates = [];

  if (element.role && element.name) {
    pushCandidate(candidates, 'role', { role: element.role, name: element.name });
  }

  pushCandidate(candidates, 'testId', element.testId);
  pushCandidate(candidates, 'label', element.label);
  pushCandidate(candidates, 'placeholder', element.placeholder);
  pushCandidate(candidates, 'text', element.text);
  pushCandidate(candidates, 'css', element.css);

  return candidates.sort((left, right) => {
    const priority = { testId: 0, role: 1, label: 2, placeholder: 3, text: 4, css: 5 };
    return priority[left.strategy] - priority[right.strategy];
  });
}
