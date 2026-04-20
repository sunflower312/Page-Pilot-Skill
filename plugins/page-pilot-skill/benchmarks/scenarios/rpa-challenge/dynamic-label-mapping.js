import {
  captureScreenshot,
  runProbe,
  finalizeScenario,
  validatePlaywright,
  validatePlaywrightBatches,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const challengeRows = [
  ['John', 'Smith', 'IT Solutions', 'Analyst', '98 North Road', 'jsmith@itsolutions.co.uk', '40716543298'],
  ['Jane', 'Dorsey', 'MediCare', 'Medical Engineer', '11 Crown Street', 'jdorsey@mc.com', '40791345621'],
  ['Albert', 'Kipling', 'Waterfront', 'Accountant', '22 Guild Street', 'kipling@waterfront.com', '40735416854'],
  ['Michael', 'Robertson', 'MediCare', 'IT Specialist', '17 Farburn Terrace', 'mrobertson@mc.com', '40733652145'],
  ['Doug', 'Derrick', 'Timepath Inc.', 'Analyst', '99 Shire Oak Road', 'dderrick@timepath.co.uk', '40799885412'],
  ['Jessie', 'Marlowe', 'Aperture Inc.', 'Scientist', '27 Cheshire Street', 'jmarlowe@aperture.us', '40733154268'],
  ['Stan', 'Hamm', 'Sugarwell', 'Advisor', '10 Dam Road', 'shamm@sugarwell.org', '40712462257'],
  ['Michelle', 'Norton', 'Aperture Inc.', 'Scientist', '13 White Rabbit Street', 'mnorton@aperture.us', '40731254562'],
  ['Stacy', 'Shelby', 'TechDev', 'HR Manager', '19 Pineapple Boulevard', 'sshelby@techdev.com', '40741785214'],
  ['Lara', 'Palmer', 'Timepath Inc.', 'Programmer', '87 Orange Street', 'lpalmer@timepath.co.uk', '40731653845'],
];

const challengeRowMaps = challengeRows.map((row) => ({
  'First Name': row[0],
  'Last Name': row[1],
  'Company Name': row[2],
  'Role in Company': row[3],
  Address: row[4],
  Email: row[5],
  'Phone Number': row[6],
}));

const readChallengeStateScript = `
  const knownLabels = [
    'First Name',
    'Last Name',
    'Company Name',
    'Role in Company',
    'Address',
    'Email',
    'Phone Number',
  ];

  function normalizeLabel(label) {
    return String(label || '').replace(/\\s+/g, ' ').trim();
  }

  function escapeAttribute(value) {
    return String(value || '').replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\\\"');
  }

  function escapeId(value) {
    return String(value || '').replace(/([ !"#$%&'()*+,./:;<=>?@[\\\\\\]^\\\`{|}~])/g, '\\\\\\\\$1');
  }

  function currentRound() {
    const match = document.body.textContent.match(/Round\\s+(\\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function currentFields() {
    return [...document.querySelectorAll('input[ng-reflect-name], .input-field input, form input')]
      .filter((input) => input.type !== 'submit' && input.type !== 'hidden')
      .map((input) => {
        const label =
          input.closest('.input-field')?.querySelector('label') ||
          input.parentElement?.querySelector('label') ||
          input.closest('div')?.querySelector('label');
        const text = normalizeLabel(label?.textContent);
        if (!text) {
          return null;
        }

        const reflectedName = input.getAttribute('ng-reflect-name');
        const byReflectedName = reflectedName ? 'input[ng-reflect-name="' + escapeAttribute(reflectedName) + '"]' : null;
        const name = input.getAttribute('name');
        const byName = name ? 'input[name="' + escapeAttribute(name) + '"]' : null;
        const id = input.id ? '#' + escapeId(input.id) : null;

        return {
          label: text,
          selector: byReflectedName || byName || id,
        };
      })
      .filter(Boolean);
  }

  const fields = currentFields();
  const dedupedFields = [];
  const seen = new Set();
  for (const field of fields) {
    if (!knownLabels.includes(field.label) || seen.has(field.label)) {
      continue;
    }
    seen.add(field.label);
    dedupedFields.push(field);
  }
  return {
    round: currentRound(),
    signature: dedupedFields.map((field) => field.label).join('|'),
    successText: document.body.textContent.replace(/\\s+/g, ' ').trim(),
    fields: dedupedFields,
  };
`;

async function readChallengeState(context, sessionId, title = 'Read the current RPA Challenge form state') {
  const response = await runProbe(
    context,
    sessionId,
    title,
    readChallengeStateScript,
    (data) => ({
      round: data.round,
      fieldCount: Array.isArray(data.fields) ? data.fields.length : 0,
      success: /congratulations!/i.test(data.successText ?? ''),
    })
  );
  return response.data;
}

async function waitForChallengeFields(context, sessionId, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await readChallengeState(context, sessionId);
    if (Array.isArray(state.fields) && state.fields.length >= 7) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Expected the RPA Challenge page to expose seven mapped inputs.');
}

async function waitForChallengeAdvance(context, sessionId, previousState, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await readChallengeState(context, sessionId, 'Wait for the challenge round to advance');
    if (/congratulations!/i.test(state.successText ?? '')) {
      return { kind: 'success', state };
    }

    if (
      Number.isFinite(previousState.round) &&
      Number.isFinite(state.round) &&
      state.round > previousState.round
    ) {
      return { kind: 'round_advanced', state };
    }

    if (
      (previousState.round === null || state.round === null) &&
      state.signature &&
      state.signature !== previousState.signature
    ) {
      return { kind: 'signature_changed', state };
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('The RPA Challenge page never advanced to the next round.');
}

function buildRowActionBatches(state, row) {
  const actions = state.fields.map((field) => {
    const value = row[field.label];
    if (value === undefined) {
      throw new Error(`Unmapped challenge label: ${field.label}`);
    }

    const action = {
      type: 'fill',
      locator: { strategy: 'label', value: field.label },
      value,
    };

    if (field.selector) {
      action.fallbackLocators = [{ strategy: 'css', value: field.selector }];
    }

    return action;
  });

  const submitAction = {
    type: 'click',
    locator: { strategy: 'role', value: { role: 'button', name: 'Submit' } },
    fallbackLocators: [{ strategy: 'css', value: 'input[type="submit"]' }],
  };

  const midpoint = Math.ceil(actions.length / 2);
  return [actions.slice(0, midpoint), [...actions.slice(midpoint), submitAction]];
}

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the RPA Challenge page', 'brief');
        await validatePlaywright(context, sessionId, 'Start the dynamic label challenge', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Start' } } },
        ]);

        const completedRows = [];
        let currentState = await waitForChallengeFields(context, sessionId);

        for (const row of challengeRowMaps) {
          await validatePlaywrightBatches(context, sessionId, `Fill and submit challenge row for ${row['First Name']}`, buildRowActionBatches(currentState, row));

          const transition = await waitForChallengeAdvance(context, sessionId, currentState);
          completedRows.push(row['First Name']);
          currentState = transition.state;

          if (transition.kind === 'success') {
            break;
          }
        }

        if (!/congratulations!/i.test(currentState.successText ?? '')) {
          throw new Error('Challenge rows were submitted, but the success state never appeared.');
        }

        addArtifact(await captureScreenshot(context, sessionId, 'rpa-challenge-complete'));
        return {
          summary: `Completed the RPA Challenge by mapping ${completedRows.length} reordered form rows.`,
          details: {
            attemptedRows: challengeRowMaps.length,
            completedRows,
            successText: currentState.successText,
            finalRound: currentState.round,
          },
        };
      },
      { url: 'https://rpachallenge.com/' }
    );

    return finalizeScenario(sessionRun);
  },
};
