import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  runActions,
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

const runChallengeScript = `
  const rows = ${JSON.stringify(challengeRows)}.map((row) => ({
    'First Name': row[0],
    'Last Name': row[1],
    'Company Name': row[2],
    'Role in Company': row[3],
    Address: row[4],
    Email: row[5],
    'Phone Number': row[6],
  }));

  function normalizeLabel(label) {
    return String(label || '').replace(/\\s+/g, ' ').trim();
  }

  function currentSignature() {
    return [...document.querySelectorAll('label')].map((label) => normalizeLabel(label.textContent)).join('|');
  }

  function currentRound() {
    const match = document.body.textContent.match(/Round\\s+(\\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function currentFields() {
    return [...document.querySelectorAll('input[ng-reflect-name]')].map((input) => {
      const label =
        input.closest('.input-field')?.querySelector('label') ||
        input.parentElement?.querySelector('label') ||
        input.closest('div')?.querySelector('label');
      return {
        input,
        label: normalizeLabel(label?.textContent),
      };
    });
  }

  function setFieldValue(input, value) {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const submitButton =
    document.querySelector('input[type="submit"]') ||
    [...document.querySelectorAll('button')].find((button) => normalizeLabel(button.textContent) === 'Submit');
  if (!submitButton) {
    throw new Error('Submit control is missing from the RPA Challenge form.');
  }

  let previousSignature = currentSignature();
  let previousRound = currentRound();
  const completedRows = [];
  for (const row of rows) {
    const fieldDeadline = Date.now() + 5000;
    while (Date.now() < fieldDeadline && currentFields().length < 7) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const fields = currentFields();
    if (fields.length < 7) {
      throw new Error(\`Expected seven mapped inputs, found \${fields.length}.\`);
    }
    for (const field of fields) {
      const value = row[field.label];
      if (value === undefined) {
        throw new Error(\`Unmapped challenge label: \${field.label}\`);
      }
      setFieldValue(field.input, value);
    }
    submitButton.click();

    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const body = document.body.textContent.replace(/\\s+/g, ' ').trim();
      if (/congratulations!/i.test(body)) {
        completedRows.push(row['First Name']);
        return {
          attemptedRows: rows.length,
          completedRows,
          successText: body,
        };
      }

      const nextRound = currentRound();
      if (previousRound !== null && nextRound !== null && nextRound > previousRound) {
        completedRows.push(row['First Name']);
        previousRound = nextRound;
        previousSignature = currentSignature();
        break;
      }

      const nextSignature = currentSignature();
      if ((previousRound === null || nextRound === null) && nextSignature && nextSignature !== previousSignature) {
        completedRows.push(row['First Name']);
        previousSignature = nextSignature;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const finalBody = document.body.textContent.replace(/\\s+/g, ' ').trim();
  if (!/congratulations!/i.test(finalBody)) {
    throw new Error('Challenge rows were submitted, but the success state never appeared.');
  }

  return {
    attemptedRows: rows.length,
    completedRows,
    successText: finalBody,
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the RPA Challenge page', 'brief');
        await runActions(context, sessionId, 'Start the dynamic label challenge', [
          { type: 'click', locator: { strategy: 'role', value: { role: 'button', name: 'Start' } } },
        ]);
        const result = await executeScript(
          context,
          sessionId,
          'Fill the challenge rows using dynamic label mapping',
          runChallengeScript,
          (data) => ({
            attemptedRows: data.attemptedRows,
            completedRows: data.completedRows.length,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'rpa-challenge-complete'));
        return {
          summary: `Completed the RPA Challenge by mapping ${result.data.completedRows.length} reordered form rows.`,
          details: result.data,
        };
      },
      { url: 'https://rpachallenge.com/' }
    );

    return finalizeScenario(sessionRun);
  },
};
