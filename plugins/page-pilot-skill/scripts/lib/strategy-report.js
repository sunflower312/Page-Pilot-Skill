import {
  buildPageStateModel,
  buildTaskPlan,
  buildRecoveryPlan,
  suggestNextActions,
} from './strategy-state.js';
import {
  buildSiteProfile,
  buildLearnedExperience,
  summarizeWorkflow,
} from './workflow-intelligence.js';

function selectWorkflowSummary(session = {}) {
  if (session.lastWorkflowSummary) {
    return session.lastWorkflowSummary;
  }
  if (session.lastSuccessfulRun?.steps?.length) {
    return summarizeWorkflow(session.lastSuccessfulRun.steps);
  }
  return null;
}

export function buildStrategyReport({ session = {}, scan, goal = '' } = {}) {
  const stateModel = buildPageStateModel(scan);

  const learnedExperience = buildLearnedExperience(session, stateModel);
  const siteProfile = buildSiteProfile(session, stateModel);
  const taskPlan = buildTaskPlan(goal, stateModel);
  const workflowSummary = selectWorkflowSummary(session);

  return {
    ok: true,
    goal: goal || undefined,
    state: stateModel,
    taskPlan,
    nextActions: suggestNextActions(scan, stateModel, taskPlan, learnedExperience),
    recovery: buildRecoveryPlan({
      scan,
      stateModel,
      lastFailure: session.lastActionFailure,
      learnedExperience,
    }),
    learnedExperience,
    siteProfile,
    workflowSummary,
    site: {
      key: learnedExperience.siteKey,
      knownWorkflowCount: learnedExperience.workflows.length,
      workflowTemplateCount: siteProfile.workflowTemplateCount,
      transitionCount: siteProfile.transitionCount,
    },
  };
}
