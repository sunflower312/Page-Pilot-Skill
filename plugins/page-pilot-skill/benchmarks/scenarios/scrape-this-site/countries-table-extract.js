import {
  captureScreenshot,
  executeScript,
  finalizeScenario,
  scanPage,
  withScenarioSession,
} from '../_shared/scenario-tools.js';

const extractCountriesScript = `
  const countries = [...document.querySelectorAll('.country')].map((country) => ({
    name: country.querySelector('.country-name')?.textContent?.trim() ?? '',
    capital: country.querySelector('.country-capital')?.textContent?.trim() ?? '',
    population: country.querySelector('.country-population')?.textContent?.trim() ?? '',
    area: country.querySelector('.country-area')?.textContent?.trim() ?? '',
  }));
  if (countries.length < 200) {
    throw new Error(\`Expected a large country list, got \${countries.length} entries.\`);
  }
  if (countries.slice(0, 10).some((country) => !country.name || !country.capital)) {
    throw new Error('Country extraction returned empty name or capital fields.');
  }
  return {
    count: countries.length,
    sample: countries.slice(0, 5),
  };
`;

export const scenario = {
  async run(context) {
    const sessionRun = await withScenarioSession(
      context,
      async ({ sessionId, addArtifact }) => {
        await scanPage(context, sessionId, 'Scan the countries table page', 'brief');
        const extraction = await executeScript(
          context,
          sessionId,
          'Extract the countries table',
          extractCountriesScript,
          (data) => ({
            count: data.count,
            firstCountry: data.sample[0]?.name ?? null,
          })
        );
        addArtifact(await captureScreenshot(context, sessionId, 'scrape-this-site-countries'));
        return {
          summary: `Extracted ${extraction.data.count} countries from the simple table sandbox.`,
          details: extraction.data,
        };
      },
      { url: 'https://www.scrapethissite.com/pages/simple/' }
    );

    return finalizeScenario(sessionRun);
  },
};
