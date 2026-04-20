function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function compareValues(candidateValue, targetValue, weights) {
  const candidate = normalizeText(candidateValue);
  const target = normalizeText(targetValue);

  if (!candidate || !target) {
    return { score: 0, reason: null };
  }

  if (candidate === target) {
    return { score: weights.exact, reason: 'exact_match' };
  }

  if (candidate.includes(target) || target.includes(candidate)) {
    return { score: weights.partial, reason: 'partial_match' };
  }

  return { score: 0, reason: null };
}

function flattenInteractives(interactives = {}) {
  const entries = [];

  for (const groupEntries of Object.values(interactives)) {
    for (const entry of groupEntries ?? []) {
      entries.push(entry);
    }
  }

  return entries;
}

function buildFingerprintTarget(target = {}) {
  return {
    role: target.stableFingerprint?.role ?? target.role ?? '',
    accessibleName: target.stableFingerprint?.accessibleName ?? target.accessibleName ?? '',
    description: target.stableFingerprint?.description ?? target.description ?? '',
    testId: target.stableFingerprint?.testId ?? target.attributes?.testId ?? '',
    context: target.stableFingerprint?.context ?? {},
  };
}

function buildMatch(entry = {}, target = {}) {
  const reasons = [];
  let score = 0;
  let semanticMatchCount = 0;

  if (target.role && entry.role === target.role) {
    score += 30;
    reasons.push('role_match');
    semanticMatchCount += 1;
  }

  const accessibleName = compareValues(entry.accessibleName, target.accessibleName, { exact: 34, partial: 22 });
  if (accessibleName.score > 0) {
    score += accessibleName.score;
    reasons.push(`accessible_name_${accessibleName.reason}`);
    semanticMatchCount += 1;
  }

  const visibleText = compareValues(entry.visibleText, target.visibleText, { exact: 24, partial: 14 });
  if (visibleText.score > 0) {
    score += visibleText.score;
    reasons.push(`visible_text_${visibleText.reason}`);
    semanticMatchCount += 1;
  }

  const description = compareValues(entry.description, target.description, { exact: 12, partial: 6 });
  if (description.score > 0) {
    score += description.score;
    reasons.push(`description_${description.reason}`);
    semanticMatchCount += 1;
  }

  const targetLabel = target.attributes?.label ?? '';
  const labelMatch = compareValues(entry.attributes?.label ?? entry.label, targetLabel, { exact: 28, partial: 16 });
  if (labelMatch.score > 0) {
    score += labelMatch.score;
    reasons.push(`label_${labelMatch.reason}`);
    semanticMatchCount += 1;
  }

  const targetPlaceholder = target.attributes?.placeholder ?? '';
  const placeholderMatch = compareValues(
    entry.attributes?.placeholder ?? entry.placeholder,
    targetPlaceholder,
    { exact: 26, partial: 16 }
  );
  if (placeholderMatch.score > 0) {
    score += placeholderMatch.score;
    reasons.push(`placeholder_${placeholderMatch.reason}`);
    semanticMatchCount += 1;
  }

  const targetTestId = target.attributes?.testId ?? '';
  if (targetTestId && (entry.attributes?.testId ?? entry.testId) === targetTestId) {
    score += 26;
    reasons.push('test_id_match');
    semanticMatchCount += 1;
  }

  if (target.css && entry.css === target.css) {
    score += 20;
    reasons.push('css_match');
    semanticMatchCount += 1;
  }

  const fingerprint = buildFingerprintTarget(target);
  if (fingerprint.role && entry.stableFingerprint?.role === fingerprint.role) {
    score += 8;
    reasons.push('fingerprint_role');
  }
  if (fingerprint.accessibleName && entry.stableFingerprint?.accessibleName === fingerprint.accessibleName) {
    score += 14;
    reasons.push('fingerprint_accessible_name');
    semanticMatchCount += 1;
  }
  if (fingerprint.description && entry.stableFingerprint?.description === fingerprint.description) {
    score += 10;
    reasons.push('fingerprint_description');
    semanticMatchCount += 1;
  }
  if (fingerprint.testId && entry.stableFingerprint?.testId === fingerprint.testId) {
    score += 12;
    reasons.push('fingerprint_test_id');
    semanticMatchCount += 1;
  }

  if (fingerprint.context?.withinDialog === true && entry.stableFingerprint?.context?.withinDialog === true) {
    score += 4;
    reasons.push('fingerprint_dialog_context');
  }
  if (fingerprint.context?.withinForm === true && entry.stableFingerprint?.context?.withinForm === true) {
    score += 4;
    reasons.push('fingerprint_form_context');
  }
  if (fingerprint.context?.withinMain === true && entry.stableFingerprint?.context?.withinMain === true) {
    score += 2;
    reasons.push('fingerprint_main_context');
  }

  if (semanticMatchCount > 0 && entry.actionability?.actionable === true) {
    score += 5;
    reasons.push('actionable');
  }

  if (semanticMatchCount > 0) {
    score += Math.round((entry.confidence?.score ?? 0) * 10);
  }

  return {
    score,
    semanticMatchCount,
    reasons,
  };
}

function compareMatches(left, right) {
  if (right.match.score !== left.match.score) {
    return right.match.score - left.match.score;
  }

  const leftConfidence = left.entry.confidence?.score ?? 0;
  const rightConfidence = right.entry.confidence?.score ?? 0;
  if (rightConfidence !== leftConfidence) {
    return rightConfidence - leftConfidence;
  }

  return String(left.entry.css ?? '').localeCompare(String(right.entry.css ?? ''));
}

export function rankSemanticTarget(scan = {}, target = {}, options = {}) {
  const limit = options.limit ?? 8;
  const interactiveEntries = flattenInteractives(scan.interactives);
  const matches = interactiveEntries
    .map((entry) => ({
      entry,
      match: buildMatch(entry, target),
    }))
    .filter((candidate) => candidate.match.semanticMatchCount > 0 && candidate.match.score > 0)
    .sort(compareMatches)
    .slice(0, limit)
    .map((candidate, index) => ({
      rank: index + 1,
      score: candidate.match.score,
      semanticMatchCount: candidate.match.semanticMatchCount,
      reasons: candidate.match.reasons,
      element: candidate.entry,
      recommendedLocators: candidate.entry.recommendedLocators ?? [],
      preferredLocator: candidate.entry.preferredLocator ?? null,
      fallbackLocators: candidate.entry.fallbackLocators ?? [],
      stableFingerprint: candidate.entry.stableFingerprint ?? null,
      confidence: candidate.entry.confidence ?? null,
    }));

  return {
    ok: true,
    query: target,
    matchCount: matches.length,
    matches,
  };
}

export function deriveSemanticTargetFromLocator(locator = {}) {
  if (!locator?.strategy) {
    return {};
  }

  if (locator.strategy === 'role') {
    return {
      role: locator.value?.role ?? '',
      accessibleName: locator.value?.name ?? '',
    };
  }

  if (locator.strategy === 'label') {
    return {
      accessibleName: locator.value,
    };
  }

  if (locator.strategy === 'text') {
    return {
      visibleText: locator.value,
    };
  }

  if (locator.strategy === 'placeholder') {
    return {
      attributes: {
        placeholder: locator.value,
      },
    };
  }

  if (locator.strategy === 'testId') {
    return {
      attributes: {
        testId: locator.value,
      },
    };
  }

  if (locator.strategy === 'css') {
    return {
      css: locator.value,
    };
  }

  return {};
}
