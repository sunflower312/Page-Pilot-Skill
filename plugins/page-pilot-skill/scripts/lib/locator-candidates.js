import { rankLocatorCandidates } from './locator-ranking.js';

export function buildLocatorCandidates(element = {}) {
  return rankLocatorCandidates(element).map((candidate) => ({
    ...candidate.locator,
    stability: candidate.stability,
    reason: candidate.reasons[0] ?? '',
  }));
}
