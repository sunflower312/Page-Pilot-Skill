import {
  planGoalCycle,
  buildGoalContext,
  createGoalHistory,
  evaluateGoalCompletion,
  recordGoalCycleFailure,
  recordGoalCycleSuccess,
  shouldMarkGoalPhaseComplete,
} from './goal-planner.js';
import { executeSessionActions } from './session-action-execution.js';
import { buildStrategyReport } from './strategy-report.js';
import { collectStructuredPageData } from './structured-scan.js';
import {
  recordFailureRun,
  recordGoalRun,
  recordStateTransition,
  recordSuccessfulRun,
  summarizeWorkflow,
} from './workflow-intelligence.js';

function successfulSteps(result = {}) {
  return (result.steps ?? []).filter((step) => step.ok !== false);
}

function summarizePlannedActions(actions = []) {
  return actions.map((action) => ({
    type: action.type,
    locator: action.locator,
    fallbackLocators: action.fallbackLocators,
    value: action.value,
    checked: action.checked,
  }));
}

async function captureCurrentReport(session, goal) {
  const scan = await collectStructuredPageData(session.page, { detailLevel: 'standard' });
  return {
    scan,
    report: buildStrategyReport({ session, scan, goal }),
  };
}

function buildCycleRecord(index, report, plan) {
  return {
    index,
    state: report.state,
    taskPlan: report.taskPlan,
    selectedPhase: plan.phaseId,
    rationale: plan.rationale,
    status: plan.status,
    plannedActions: summarizePlannedActions(plan.actions),
    needsInput: plan.needsInput ?? [],
  };
}

function buildOutcome(status, completed, cycles, finalReport, workflowSummary, needsInput = []) {
  return {
    ok: true,
    status,
    completed,
    cycles,
    needsInput,
    finalReport,
    learnedExperience: finalReport.learnedExperience,
    workflowSummary,
    codegenReady: completed && workflowSummary.stepCount > 0,
  };
}

async function finalizeGoalRun({ session, goal, status, completed, cycles, summary, finalState }) {
  recordGoalRun(session, {
    goal,
    status,
    completed,
    cycleCount: cycles.length,
    finalUrl: session.page.url(),
    stateModel: finalState,
    workflowSummary: summary,
  });

  const { report } = await captureCurrentReport(session, goal);
  return report;
}

export async function exploreGoal({
  sessionId,
  session,
  goal,
  inputHints = {},
  successIndicators = {},
  maxCycles = 6,
  maxActionsPerCycle = 4,
  artifactManager,
} = {}) {
  const goalContext = buildGoalContext({ goal, inputHints, successIndicators });
  const history = createGoalHistory();
  const cycles = [];
  const aggregateSteps = [];
  const initialUrl = session.page.url();
  let status = 'stalled';
  let completed = false;
  let pendingNeedsInput = [];

  for (let index = 1; index <= maxCycles; index += 1) {
    const { scan, report } = await captureCurrentReport(session, goal);
    const completion = evaluateGoalCompletion({ scan, report, goalContext, history });

    if (completion.completed) {
      status = 'success';
      completed = true;
      break;
    }

    const plan = planGoalCycle({
      scan,
      report,
      goalContext,
      history,
      maxActions: maxActionsPerCycle,
    });
    const cycle = buildCycleRecord(index, report, plan);

    if (plan.status === 'needs_input') {
      cycles.push(cycle);
      status = 'needs_input';
      pendingNeedsInput = plan.needsInput;
      break;
    }

    if (plan.status === 'stalled') {
      cycles.push(cycle);
      status = 'stalled';
      break;
    }

    const execution = await executeSessionActions({ sessionId, session, actions: plan.actions, artifactManager });
    cycle.execution = {
      ok: execution.result.ok,
      finalUrl: execution.result.finalUrl,
      observation: execution.observation,
      steps: execution.result.steps,
    };
    cycles.push(cycle);
    aggregateSteps.push(...successfulSteps(execution.result));

    if (execution.result.ok) {
      const phaseCompleted = shouldMarkGoalPhaseComplete({
        plan,
        beforeState: report.state,
        afterState: execution.strategyState ?? report.state,
        observation: execution.observation,
      });
      recordGoalCycleSuccess(history, {
        fingerprint: report.state.fingerprint,
        plan: { ...plan, completesPhase: phaseCompleted },
        steps: execution.result.steps,
      });
      recordStateTransition(session, {
        fromState: report.state,
        toState: execution.strategyState ?? report.state,
        phaseId: plan.phaseId,
        actions: plan.actions,
        goal,
      });
      continue;
    }

    recordGoalCycleFailure(history, {
      fingerprint: report.state.fingerprint,
      plan,
      error: execution.result.error,
    });
    recordFailureRun(session, {
      error: execution.result.error,
      action: plan.actions[execution.result.error?.stepIndex ?? 0] ?? plan.actions[0] ?? null,
      stateModel: execution.strategyState ?? report.state,
    });
    status = 'failed';
  }

  const { scan: finalScan, report: finalReportBeforePersist } = await captureCurrentReport(session, goal);
  const finalCompletion = evaluateGoalCompletion({
    scan: finalScan,
    report: finalReportBeforePersist,
    goalContext,
    history,
  });

  if (finalCompletion.completed) {
    status = 'success';
    completed = true;
  }

  let workflowSummary = summarizeWorkflow(aggregateSteps, {
    goal,
    stateModel: finalReportBeforePersist.state,
  });

  if (completed && aggregateSteps.length > 0) {
    session.lastSuccessfulRun = {
      initialUrl,
      finalUrl: session.page.url(),
      steps: aggregateSteps,
    };
    workflowSummary = recordSuccessfulRun(session, {
      goal,
      stateModel: finalReportBeforePersist.state,
      initialUrl,
      finalUrl: session.page.url(),
      steps: aggregateSteps,
    });
  }

  const finalReport = await finalizeGoalRun({
    session,
    goal,
    status,
    completed,
    cycles,
    summary: workflowSummary,
    finalState: finalReportBeforePersist.state,
  });

  return buildOutcome(status, completed, cycles, finalReport, workflowSummary, pendingNeedsInput);
}
