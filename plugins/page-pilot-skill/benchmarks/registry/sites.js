import { defineScenarioRef, defineSiteManifest } from '../lib/scenario-helpers.js';

const CAPABILITY_BY_TAG = new Map([
  ['catalog', 'content_extraction'],
  ['quotes', 'content_extraction'],
  ['extract', 'content_extraction'],
  ['table', 'content_extraction'],
  ['javascript', 'content_extraction'],
  ['dynamic-table', 'content_extraction'],
  ['pagination', 'pagination_and_growth'],
  ['load-more', 'pagination_and_growth'],
  ['infinite-scroll', 'pagination_and_growth'],
  ['ajax', 'async_waiting'],
  ['waiting', 'async_waiting'],
  ['dynamic-content', 'async_waiting'],
  ['dynamic-waits', 'async_waiting'],
  ['timing', 'async_waiting'],
  ['progressbar', 'async_waiting'],
  ['dynamic-controls', 'async_waiting'],
  ['auth', 'forms_and_auth'],
  ['register', 'forms_and_auth'],
  ['form', 'forms_and_auth'],
  ['forms', 'forms_and_auth'],
  ['submit', 'forms_and_auth'],
  ['input-state', 'forms_and_auth'],
  ['hidden-fields', 'forms_and_auth'],
  ['radio-checkbox', 'forms_and_auth'],
  ['dialog', 'dialogs_and_visibility'],
  ['modal', 'dialogs_and_visibility'],
  ['toast', 'dialogs_and_visibility'],
  ['visibility', 'dialogs_and_visibility'],
  ['interaction', 'dialogs_and_visibility'],
  ['iframe', 'iframe_and_shadow'],
  ['cross-origin', 'iframe_and_shadow'],
  ['shadow-dom', 'iframe_and_shadow'],
  ['stateful-flow', 'stateful_workflows'],
  ['multi-page', 'stateful_workflows'],
  ['banking-sandbox', 'stateful_workflows'],
  ['unstable-locators', 'locator_resilience'],
  ['dynamic-labels', 'locator_resilience'],
  ['input-state', 'locator_resilience'],
  ['radio-checkbox', 'locator_resilience'],
  ['interaction', 'locator_resilience'],
]);

function qualifiedSite(site) {
  return defineSiteManifest(
    {
      ...site,
      status: 'qualified',
    },
    import.meta.url
  );
}

function inferCapabilities(tags = [], explicitCapabilities = []) {
  const capabilities = new Set(explicitCapabilities);
  for (const tag of tags) {
    const mapped = CAPABILITY_BY_TAG.get(tag);
    if (mapped) {
      capabilities.add(mapped);
    }
  }
  return [...capabilities].sort();
}

function scenario(id, title, module, entryUrl, tags, guide, status = 'qualified', metadata = {}) {
  return defineScenarioRef({
    id,
    title,
    status,
    module,
    entryUrl,
    tags,
    guide,
    metadata: {
      ...metadata,
      capabilities: inferCapabilities(tags, metadata.capabilities),
    },
  });
}

export const siteRegistry = [
  qualifiedSite({
    id: 'toscrape',
    name: 'ToScrape (Books + Quotes)',
    baseUrl: 'https://books.toscrape.com/',
    tags: ['public-sandbox', 'catalog', 'quotes'],
    compliance: {
      reviewStatus: 'qualified',
      publicAccess: true,
      requiresAuthentication: false,
      notes: ['Books to Scrape and Quotes to Scrape are public practice sandboxes built for scraping and automation exercises.'],
    },
    evidence: {
      sourceLinks: ['https://books.toscrape.com/', 'https://quotes.toscrape.com/'],
      lastReviewedAt: '2026-04-18',
      notes: ['Validated live on 2026-04-18 for catalogue pagination, login, JavaScript rendering, and infinite scroll growth.'],
    },
    scenarios: [
      scenario(
        'paginated-catalog-extract',
        'Advance to the second catalogue page and extract book cards',
        '../scenarios/toscrape/paginated-catalog-extract.js',
        'https://books.toscrape.com/',
        ['catalog', 'pagination', 'smoke'],
        {
          steps: [
            'Open the public book catalogue.',
            'Follow the next-pagination link.',
            'Extract book cards from page 2 and verify the catalogue size.',
          ],
          expectedResult: 'The browser reaches page 2 and returns non-empty book metadata from a 20-card catalogue grid.',
          failureModes: [
            'The next pagination link is missing or no longer unique.',
            'The catalogue grid no longer exposes 20 product cards on page 2.',
            'Book titles resolve to empty strings after navigation.',
          ],
        }
      ),
      scenario(
        'quotes-login-success',
        'Log into Quotes to Scrape with the demo credentials',
        '../scenarios/toscrape/quotes-login-success.js',
        'https://quotes.toscrape.com/login',
        ['auth', 'quotes', 'form'],
        {
          steps: [
            'Open the quotes login page.',
            'Fill the public demo credentials and submit the login form.',
            'Verify the authenticated homepage exposes Logout and quote cards.',
          ],
          expectedResult: 'The benchmark lands on the quotes homepage with a Logout link and rendered quote cards.',
          failureModes: [
            'The username or password fields no longer match stable selectors.',
            'Submitting admin/admin does not return to the homepage.',
            'The authenticated state is missing the Logout link or rendered quotes.',
          ],
        }
      ),
      scenario(
        'quotes-js-rendered-list',
        'Extract JavaScript-rendered quotes',
        '../scenarios/toscrape/quotes-js-rendered-list.js',
        'https://quotes.toscrape.com/js/',
        ['extract', 'javascript', 'quotes'],
        {
          steps: [
            'Open the JavaScript-rendered quotes page.',
            'Wait for client-rendered quote cards to appear.',
            'Extract quote text, author, and tags from the rendered list.',
          ],
          expectedResult: 'At least five rendered quotes are extracted with non-empty text and author fields.',
          failureModes: [
            'The JavaScript page never renders quote cards.',
            'Rendered cards are present but text or author values are empty.',
            'Selectors drift away from the expected quote card structure.',
          ],
        }
      ),
      scenario(
        'quotes-scroll-growth',
        'Trigger infinite-scroll quote growth',
        '../scenarios/toscrape/quotes-scroll-growth.js',
        'https://quotes.toscrape.com/scroll',
        ['infinite-scroll', 'quotes'],
        {
          steps: [
            'Open the infinite-scroll quotes page.',
            'Measure the initial quote count.',
            'Scroll to the bottom and verify that additional quotes load.',
          ],
          expectedResult: 'The visible quote count increases after scrolling.',
          failureModes: [
            'The page starts with too few quotes for a meaningful growth check.',
            'Scrolling does not load any additional quote cards.',
            'The page stops exposing quote cards after the scroll action.',
          ],
        }
      ),
    ],
  }),
  qualifiedSite({
    id: 'scrape-this-site',
    name: 'Scrape This Site',
    baseUrl: 'https://www.scrapethissite.com/pages/simple/',
    tags: ['public-sandbox', 'table', 'ajax', 'iframe'],
    compliance: {
      reviewStatus: 'qualified',
      publicAccess: true,
      requiresAuthentication: false,
      notes: ['Scrape This Site is a public scraping sandbox with intentionally scrape-friendly fixtures and realistic page shapes.'],
    },
    evidence: {
      sourceLinks: [
        'https://www.scrapethissite.com/pages/simple/',
        'https://www.scrapethissite.com/pages/forms/',
        'https://www.scrapethissite.com/pages/ajax-javascript/',
        'https://www.scrapethissite.com/pages/frames/',
      ],
      lastReviewedAt: '2026-04-18',
      notes: ['Validated live on 2026-04-18 for tables, search plus pagination, AJAX content selection, and iframe extraction.'],
    },
    scenarios: [
      scenario(
        'countries-table-extract',
        'Extract the countries table',
        '../scenarios/scrape-this-site/countries-table-extract.js',
        'https://www.scrapethissite.com/pages/simple/',
        ['table', 'extract', 'smoke'],
        {
          steps: [
            'Open the countries sandbox.',
            'Extract the table-like country blocks.',
            'Verify that names, capitals, and populations are present.',
          ],
          expectedResult: 'The benchmark extracts a large country list with non-empty key fields.',
          failureModes: [
            'The country blocks are missing or incomplete.',
            'The page exposes too few countries for the expected sandbox dataset.',
            'Name or capital extraction returns empty strings.',
          ],
        }
      ),
      scenario(
        'hockey-search-pagination',
        'Use pagination and search on the hockey teams page',
        '../scenarios/scrape-this-site/hockey-search-pagination.js',
        'https://www.scrapethissite.com/pages/forms/',
        ['search', 'pagination', 'table'],
        {
          steps: [
            'Open the hockey forms page.',
            'Switch to page 2 of the listing.',
            'Search for Toronto and verify the filtered results.',
          ],
          expectedResult: 'Pagination reaches page 2 and Toronto filtering returns only Toronto Maple Leafs rows.',
          failureModes: [
            'The page-2 pagination link no longer resolves correctly.',
            'The search form no longer updates the query string.',
            'Filtered results contain unrelated teams or no teams at all.',
          ],
        }
      ),
      scenario(
        'ajax-films-by-year',
        'Load films for a specific year with AJAX',
        '../scenarios/scrape-this-site/ajax-films-by-year.js',
        'https://www.scrapethissite.com/pages/ajax-javascript/',
        ['ajax', 'extract'],
        {
          steps: [
            'Open the AJAX film sandbox.',
            'Click the 2015 year filter.',
            'Wait for the asynchronous list to appear and extract sample rows.',
          ],
          expectedResult: 'The film list updates to the requested year and returns non-empty extracted rows.',
          failureModes: [
            'The 2015 filter is missing or no longer clickable.',
            'AJAX rows do not appear after selecting the year.',
            'Extracted rows are empty or malformed.',
          ],
        }
      ),
      scenario(
        'frames-turtle-extract',
        'Extract turtle headings from the iframe sandbox',
        '../scenarios/scrape-this-site/frames-turtle-extract.js',
        'https://www.scrapethissite.com/pages/frames/',
        ['iframe', 'extract'],
        {
          steps: [
            'Open the frames sandbox.',
            'Resolve the embedded iframe document.',
            'Extract turtle-family headings from inside the frame.',
          ],
          expectedResult: 'The benchmark returns non-empty turtle headings from the iframe content document.',
          failureModes: [
            'The iframe is missing or fails to load.',
            'The iframe document becomes inaccessible.',
            'The embedded page no longer exposes turtle headings.',
          ],
        }
      ),
    ],
  }),
  qualifiedSite({
    id: 'web-scraper-test-sites',
    name: 'Web Scraper Test Sites',
    baseUrl: 'https://webscraper.io/test-sites/e-commerce/static/computers',
    tags: ['public-training', 'catalog', 'load-more', 'infinite-scroll'],
    compliance: {
      reviewStatus: 'qualified',
      publicAccess: true,
      requiresAuthentication: false,
      notes: ['Web Scraper Test Sites are public mock catalogues for extraction and interaction benchmarking.'],
    },
    evidence: {
      sourceLinks: [
        'https://webscraper.io/test-sites/e-commerce/static/computers',
        'https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops',
        'https://webscraper.io/test-sites/e-commerce/more/computers/laptops',
        'https://webscraper.io/test-sites/e-commerce/scroll/computers/laptops',
      ],
      lastReviewedAt: '2026-04-18',
      notes: ['Validated live on 2026-04-18 for static extraction, AJAX lists, load-more growth, and infinite-scroll growth.'],
    },
    scenarios: [
      scenario(
        'static-catalog-extract',
        'Extract static laptop cards',
        '../scenarios/web-scraper-test-sites/static-catalog-extract.js',
        'https://webscraper.io/test-sites/e-commerce/static/computers',
        ['catalog', 'extract', 'smoke'],
        {
          steps: [
            'Open the static e-commerce computers category.',
            'Extract a sample of product cards.',
            'Verify titles, prices, and reviews are present.',
          ],
          expectedResult: 'The benchmark extracts non-empty product metadata from the static catalogue.',
          failureModes: [
            'Static product cards are missing.',
            'Product titles or prices resolve to empty strings.',
            'Category navigation no longer lands on the computers catalogue.',
          ],
        }
      ),
      scenario(
        'ajax-pagination-extract',
        'Extract AJAX-loaded laptop cards',
        '../scenarios/web-scraper-test-sites/ajax-pagination-extract.js',
        'https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops',
        ['ajax', 'catalog', 'extract'],
        {
          steps: [
            'Open the AJAX laptops category.',
            'Allow the client-rendered cards to load.',
            'Extract titles, prices, and review counts from the visible cards.',
          ],
          expectedResult: 'At least six AJAX-loaded cards are visible with non-empty titles and prices.',
          failureModes: [
            'The AJAX catalogue fails to render cards.',
            'Rendered cards have empty titles or prices.',
            'The category URL no longer resolves to the laptops dataset.',
          ],
        }
      ),
      scenario(
        'ajax-next-page-extract',
        'Switch to a later AJAX catalogue page and verify the card set changes',
        '../scenarios/web-scraper-test-sites/ajax-next-page-extract.js',
        'https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops',
        ['ajax', 'pagination', 'catalog'],
        {
          steps: [
            'Open the AJAX laptops catalogue.',
            'Move to a later client-side page of results.',
            'Verify the visible product set changes after the pagination action.',
          ],
          expectedResult: 'The AJAX catalogue moves to a later result page and exposes a different visible product set.',
          failureModes: [
            'No later-page control is available.',
            'The visible products do not change after the pagination action.',
            'The later-page catalogue renders empty cards or no cards at all.',
          ],
        },
        'qualified',
        { codeQualityEligible: false }
      ),
      scenario(
        'load-more-catalog-growth',
        'Grow the catalogue with the More control',
        '../scenarios/web-scraper-test-sites/load-more-catalog-growth.js',
        'https://webscraper.io/test-sites/e-commerce/more/computers/laptops',
        ['load-more', 'catalog'],
        {
          steps: [
            'Open the load-more laptops category.',
            'Measure the initial card count.',
            'Click More and verify the visible catalogue grows.',
          ],
          expectedResult: 'The number of visible product cards increases after clicking More.',
          failureModes: [
            'The More link is missing or non-actionable.',
            'The card count does not grow after clicking More.',
            'The catalogue loses cards instead of appending more items.',
          ],
        },
        'qualified',
        { codeQualityEligible: false }
      ),
      scenario(
        'scroll-growth-extract',
        'Grow the catalogue by scrolling',
        '../scenarios/web-scraper-test-sites/scroll-growth-extract.js',
        'https://webscraper.io/test-sites/e-commerce/scroll/computers/laptops',
        ['infinite-scroll', 'catalog'],
        {
          steps: [
            'Open the infinite-scroll laptops category.',
            'Measure the initial card count.',
            'Scroll to the bottom and verify more cards render.',
          ],
          expectedResult: 'The product card count increases after scrolling.',
          failureModes: [
            'The initial card count is too small for a growth check.',
            'Scrolling never loads additional products.',
            'Rendered cards disappear after scrolling.',
          ],
        }
      ),
    ],
  }),
  qualifiedSite({
    id: 'tryscrapeme',
    name: 'TryScrapeMe',
    baseUrl: 'https://tryscrapeme.com/web-scraping-practice/beginner/iframe',
    tags: ['public-training', 'iframe', 'pagination', 'forms'],
    compliance: {
      reviewStatus: 'qualified',
      publicAccess: true,
      requiresAuthentication: false,
      notes: ['TryScrapeMe is a public practice site with challenge pages designed for structured scraping and automation practice.'],
    },
    evidence: {
      sourceLinks: [
        'https://tryscrapeme.com/web-scraping-practice/beginner/iframe',
        'https://tryscrapeme.com/web-scraping-practice/beginner/pagination',
        'https://tryscrapeme.com/web-scraping-practice/beginner/simulate-login',
        'https://tryscrapeme.com/web-scraping-practice/beginner/form',
      ],
      lastReviewedAt: '2026-04-18',
      notes: ['Validated live on 2026-04-18 for cross-origin iframe discovery with follow-up extraction, pagination, simulated login, and complex form field extraction.'],
    },
    scenarios: [
      scenario(
        'iframe-table-extract',
        'Discover the cross-origin iframe and extract its referenced table',
        '../scenarios/tryscrapeme/iframe-table-extract.js',
        'https://tryscrapeme.com/web-scraping-practice/beginner/iframe',
        ['iframe', 'cross-origin', 'table', 'smoke'],
        {
          steps: [
            'Open the iframe challenge page.',
            'Confirm the embedded iframe is present and blocked by a cross-origin boundary from the parent page.',
            'Follow the iframe source document in a dedicated session and extract the table header and sample rows.',
          ],
          expectedResult:
            'The benchmark confirms the cross-origin iframe boundary, resolves the iframe source, and extracts the referenced table header plus multiple data rows.',
          failureModes: [
            'The iframe source is missing.',
            'The parent page no longer surfaces the expected cross-origin access boundary.',
            'The referenced iframe document no longer exposes a table.',
            'Table rows are empty or incomplete.',
          ],
        }
      ),
      scenario(
        'pagination-extract',
        'Paginate and extract the second table page',
        '../scenarios/tryscrapeme/pagination-extract.js',
        'https://tryscrapeme.com/web-scraping-practice/beginner/pagination',
        ['pagination', 'table'],
        {
          steps: [
            'Open the pagination challenge page.',
            'Switch to page 2.',
            'Extract the page-2 table rows.',
          ],
          expectedResult: 'The benchmark reaches page 2 and extracts non-empty table rows.',
          failureModes: [
            'The page-2 link is missing or no longer unique.',
            'The challenge does not update to pageno=2.',
            'The second-page table is empty.',
          ],
        }
      ),
      scenario(
        'simulate-login-success',
        'Submit the simulated login form and read the protected table',
        '../scenarios/tryscrapeme/simulate-login-success.js',
        'https://tryscrapeme.com/web-scraping-practice/beginner/simulate-login',
        ['auth', 'form', 'table'],
        {
          steps: [
            'Open the simulated login challenge.',
            'Submit the pre-documented username and password.',
            'Verify the protected table is visible and extract sample rows.',
          ],
          expectedResult: 'The challenge reveals a non-empty protected table after login.',
          failureModes: [
            'The login inputs are no longer stable.',
            'Submitting the documented credentials does not reveal the table.',
            'The revealed table contains no rows.',
          ],
        }
      ),
      scenario(
        'form-field-extract',
        'Extract visible and hidden form challenge fields',
        '../scenarios/tryscrapeme/form-field-extract.js',
        'https://tryscrapeme.com/web-scraping-practice/beginner/form',
        ['form', 'extract', 'hidden-fields'],
        {
          steps: [
            'Open the complex form challenge.',
            'Extract the visible input, select, and textarea fields.',
            'Read the hidden input token alongside the visible fields.',
          ],
          expectedResult: 'The benchmark returns a large field set plus the hidden token value.',
          failureModes: [
            'The challenge no longer exposes the expected form complexity.',
            'Visible fields are missing or collapse unexpectedly.',
            'The hidden token is absent.',
          ],
        }
      ),
    ],
  }),
  qualifiedSite({
    id: 'the-internet',
    name: 'The Internet',
    baseUrl: 'https://the-internet.herokuapp.com/login',
    tags: ['public-practice', 'auth', 'dynamic-content', 'shadow-dom'],
    compliance: {
      reviewStatus: 'qualified',
      publicAccess: true,
      requiresAuthentication: false,
      notes: ['The Internet is a public automation practice site with fixed demo credentials and stable exercise pages.'],
    },
    evidence: {
      sourceLinks: [
        'https://the-internet.herokuapp.com/login',
        'https://the-internet.herokuapp.com/checkboxes',
        'https://the-internet.herokuapp.com/dynamic_controls',
        'https://the-internet.herokuapp.com/dynamic_loading/2',
        'https://the-internet.herokuapp.com/entry_ad',
        'https://the-internet.herokuapp.com/iframe',
        'https://the-internet.herokuapp.com/shadowdom',
      ],
      lastReviewedAt: '2026-04-19',
      notes: ['Live probes on 2026-04-18 and 2026-04-19 confirmed the site was healthy again after an earlier transient outage, so it is restored to the qualified benchmark set with deeper async, modal, and iframe coverage.'],
    },
    scenarios: [
      scenario(
        'login-success',
        'Authenticate with the demo credentials and reach the secure area',
        '../scenarios/the-internet/login-success.js',
        'https://the-internet.herokuapp.com/login',
        ['auth', 'form', 'smoke'],
        {
          steps: [
            'Open the login page.',
            'Fill the documented demo credentials.',
            'Submit the form and verify the secure-area flash plus logout link.',
          ],
          expectedResult: 'The secure-area page appears with the success flash and logout link.',
          failureModes: [
            'The login page fails to expose the expected form fields.',
            'Valid credentials do not reach /secure.',
            'The secure-area success flash or logout link is missing.',
          ],
        }
      ),
      scenario(
        'checkboxes-toggle',
        'Toggle the checkbox state and verify the change',
        '../scenarios/the-internet/checkboxes-toggle.js',
        'https://the-internet.herokuapp.com/checkboxes',
        ['forms', 'input-state'],
        {
          steps: [
            'Open the checkboxes page.',
            'Toggle the first checkbox.',
            'Verify the checkbox state changes while the second checkbox stays checked.',
          ],
          expectedResult: 'The first checkbox becomes checked and the second checkbox remains checked.',
          failureModes: [
            'Checkbox locators become ambiguous or disappear.',
            'The checkbox state does not change after the interaction.',
            'The second checkbox unexpectedly loses its checked state.',
          ],
        },
        'qualified',
        { codeQualityEligible: false }
      ),
      scenario(
        'dynamic-controls-state',
        'Wait for dynamic checkbox and input state changes',
        '../scenarios/the-internet/dynamic-controls-state.js',
        'https://the-internet.herokuapp.com/dynamic_controls',
        ['forms', 'dynamic-controls', 'waiting', 'visibility'],
        {
          steps: [
            'Open the dynamic controls page.',
            'Remove the checkbox, wait for completion, then re-add it.',
            'Enable the text input and verify it becomes editable.',
          ],
          expectedResult: 'The checkbox area completes both remove and add cycles, and the input becomes enabled.',
          failureModes: [
            'Async remove or add never completes.',
            'The checkbox does not return after re-adding.',
            'The input stays disabled after the enable cycle.',
          ],
        }
      ),
      scenario(
        'dynamic-loading-example-2',
        'Complete the delayed loading example',
        '../scenarios/the-internet/dynamic-loading-example-2.js',
        'https://the-internet.herokuapp.com/dynamic_loading/2',
        ['dynamic-content', 'waiting'],
        {
          steps: [
            'Open the delayed-loading example.',
            'Click Start.',
            'Wait for Hello World to appear.',
          ],
          expectedResult: 'The page eventually reveals Hello World! after the delayed load.',
          failureModes: [
            'The Start button is missing or no longer actionable.',
            'Hello World never appears.',
            'The finish area renders incomplete text.',
          ],
        },
        'qualified',
        { codeQualityEligible: false }
      ),
      scenario(
        'entry-ad-close',
        'Close the entry ad modal and return to the base page',
        '../scenarios/the-internet/entry-ad-close.js',
        'https://the-internet.herokuapp.com/entry_ad',
        ['dialog', 'modal', 'interaction'],
        {
          steps: [
            'Open the entry-ad page.',
            'Confirm the modal is visible on first load.',
            'Close the modal and verify the base page remains interactive.',
          ],
          expectedResult: 'The modal closes and the page remains on the entry-ad experience without losing its restart control.',
          failureModes: [
            'The modal does not appear on first load.',
            'The close control is missing or non-actionable.',
            'The page does not recover to the base interactive state after closing the modal.',
          ],
        }
      ),
      scenario(
        'iframe-editor-extract',
        'Extract the TinyMCE iframe body text',
        '../scenarios/the-internet/iframe-editor-extract.js',
        'https://the-internet.herokuapp.com/iframe',
        ['iframe', 'extract'],
        {
          steps: [
            'Open the TinyMCE iframe example.',
            'Resolve the editable iframe document.',
            'Extract the initial editor body text from inside the iframe.',
          ],
          expectedResult: 'The benchmark accesses the iframe document and returns the initial TinyMCE body text.',
          failureModes: [
            'The iframe is missing or inaccessible from the page context.',
            'The editor body text is empty.',
            'The editor no longer exposes the expected starter text.',
          ],
        }
      ),
      scenario(
        'shadowdom-extraction',
        'Extract text from the shadow DOM example',
        '../scenarios/the-internet/shadowdom-extraction.js',
        'https://the-internet.herokuapp.com/shadowdom',
        ['shadow-dom', 'extract'],
        {
          steps: [
            'Open the shadow DOM example page.',
            'Resolve open shadow-root hosts.',
            'Extract the shadow-root text content.',
          ],
          expectedResult: 'The benchmark extracts non-empty text from the open shadow roots.',
          failureModes: [
            'The page exposes no open shadow roots.',
            'The extracted shadow text is empty.',
            'The expected sample text disappears from the component hosts.',
          ],
        }
      ),
    ],
  }),
  qualifiedSite({
    id: 'ui-testing-playground',
    name: 'UI Testing Playground',
    baseUrl: 'http://uitestingplayground.com/ajax',
    tags: ['public-practice', 'ajax', 'unstable-locators', 'visibility'],
    compliance: {
      reviewStatus: 'qualified',
      publicAccess: true,
      requiresAuthentication: false,
      notes: ['UI Testing Playground is a public automation playground. The benchmark intentionally uses HTTP because the HTTPS certificate path is unreliable in headless environments.'],
    },
    evidence: {
      sourceLinks: [
        'http://uitestingplayground.com/ajax',
        'http://uitestingplayground.com/dynamicid',
        'http://uitestingplayground.com/dynamictable',
        'http://uitestingplayground.com/progressbar',
        'http://uitestingplayground.com/shadowdom',
        'http://uitestingplayground.com/visibility',
      ],
      lastReviewedAt: '2026-04-19',
      notes: ['Validated live on 2026-04-18 and 2026-04-19 for delayed AJAX labels, unstable element IDs, dynamic-table extraction, progress bar waiting, shadow DOM components, and visibility transitions.'],
    },
    scenarios: [
      scenario(
        'ajax-wait-label',
        'Wait for the delayed AJAX label',
        '../scenarios/ui-testing-playground/ajax-wait-label.js',
        'http://uitestingplayground.com/ajax',
        ['ajax', 'waiting', 'smoke'],
        {
          steps: [
            'Open the AJAX waiting page.',
            'Trigger the delayed request.',
            'Wait for the success label to appear.',
          ],
          expectedResult: 'The delayed success label becomes visible after the request finishes.',
          failureModes: [
            'The trigger button no longer matches the expected role/name.',
            'The delayed label never appears.',
            'The page returns a different success message than expected.',
          ],
        }
      ),
      scenario(
        'dynamic-table-cpu',
        'Extract the dynamic table and match the Chrome CPU label',
        '../scenarios/ui-testing-playground/dynamic-table-cpu.js',
        'http://uitestingplayground.com/dynamictable',
        ['dynamic-table', 'extract', 'waiting'],
        {
          steps: [
            'Open the dynamic table page.',
            'Extract the current table rows.',
            'Verify the yellow CPU label matches the Chrome row in the table.',
          ],
          expectedResult: 'The extracted Chrome CPU value matches the highlighted label on the page.',
          failureModes: [
            'The ARIA table rows do not expose Chrome data.',
            'The highlighted CPU label is missing.',
            'The highlighted label value does not match the table row.',
          ],
        }
      ),
      scenario(
        'dynamic-id-button',
        'Click the dynamic-ID button with a stable locator',
        '../scenarios/ui-testing-playground/dynamic-id-button.js',
        'http://uitestingplayground.com/dynamicid',
        ['unstable-locators', 'button'],
        {
          steps: [
            'Open the dynamic-ID page.',
            'Attach a click probe to the button.',
            'Click the button using its accessible name and verify the click landed.',
          ],
          expectedResult: 'The click probe confirms that the dynamic-ID button received the interaction.',
          failureModes: [
            'The button text no longer uniquely identifies the dynamic-ID target.',
            'The button receives no click event despite a successful action.',
            'The page stops exposing the dynamic-ID button altogether.',
          ],
        }
      ),
      scenario(
        'progressbar-stop',
        'Stop the progress bar near the requested threshold',
        '../scenarios/ui-testing-playground/progressbar-stop.js',
        'http://uitestingplayground.com/progressbar',
        ['progressbar', 'waiting', 'timing'],
        {
          steps: [
            'Open the progress bar page.',
            'Start the progress bar.',
            'Wait until it reaches the target range and stop it.',
          ],
          expectedResult: 'The progress bar stops near the requested 75 percent target instead of running to completion.',
          failureModes: [
            'The progress bar never starts or never advances.',
            'The stop action misses the target range by too much.',
            'The page stops exposing the progress value.',
          ],
        }
      ),
      scenario(
        'shadowdom-guid',
        'Operate the shadow DOM GUID generator',
        '../scenarios/ui-testing-playground/shadowdom-guid.js',
        'http://uitestingplayground.com/shadowdom',
        ['shadow-dom', 'interaction'],
        {
          steps: [
            'Open the shadow DOM page.',
            'Trigger GUID generation inside the custom element.',
            'Verify the shadow-root input receives a non-empty GUID-like value.',
          ],
          expectedResult: 'The custom element updates its internal input with a generated GUID-like value.',
          failureModes: [
            'The custom element no longer exposes an open shadow root.',
            'The generate button inside the shadow root is missing.',
            'The generated value is empty or malformed.',
          ],
        },
        'qualified',
        { codeQualityEligible: false }
      ),
      scenario(
        'visibility-hide-status',
        'Trigger and verify visibility-state changes',
        '../scenarios/ui-testing-playground/visibility-hide-status.js',
        'http://uitestingplayground.com/visibility',
        ['visibility', 'interaction'],
        {
          steps: [
            'Open the visibility page.',
            'Record the initial state of the target buttons.',
            'Click Hide and verify that most target buttons become hidden or removed.',
          ],
          expectedResult: 'The post-click state shows multiple buttons hidden, removed, or visually suppressed.',
          failureModes: [
            'The Hide button no longer exists.',
            'The target buttons remain visible after the interaction.',
            'The page structure changes enough that visibility states cannot be resolved.',
          ],
        }
      ),
    ],
  }),
  qualifiedSite({
    id: 'expand-testing',
    name: 'Expand Testing Practice',
    baseUrl: 'https://practice.expandtesting.com/login',
    tags: ['public-practice', 'auth', 'forms'],
    compliance: {
      reviewStatus: 'qualified',
      publicAccess: true,
      requiresAuthentication: false,
      notes: ['Expand Testing exposes public practice pages for login, registration, and input automation flows.'],
    },
    evidence: {
      sourceLinks: [
        'https://practice.expandtesting.com/login',
        'https://practice.expandtesting.com/register',
        'https://practice.expandtesting.com/dynamic-pagination-table',
        'https://practice.expandtesting.com/iframe',
        'https://practice.expandtesting.com/inputs',
        'https://practice.expandtesting.com/shadowdom',
      ],
      lastReviewedAt: '2026-04-19',
      notes: ['Validated live on 2026-04-18 and 2026-04-19 for secure-area login, user registration, dynamic pagination tables, iframe content extraction, input display plus clear workflows, and shadow DOM extraction.'],
    },
    scenarios: [
      scenario(
        'dynamic-pagination-table',
        'Paginate the student table and extract the next row set',
        '../scenarios/expand-testing/dynamic-pagination-table.js',
        'https://practice.expandtesting.com/dynamic-pagination-table',
        ['pagination', 'table', 'waiting'],
        {
          steps: [
            'Open the dynamic pagination table.',
            'Move to a later table page.',
            'Extract the visible rows and verify the page changes.',
          ],
          expectedResult: 'The benchmark reaches a later page and extracts a new visible row set from the table.',
          failureModes: [
            'The next-page control is missing or blocked by the table widget.',
            'The table rows do not change after pagination.',
            'Extracted rows are empty or malformed.',
          ],
        },
        'qualified',
        { codeQualityEligible: false }
      ),
      scenario(
        'login-success',
        'Authenticate with the practice credentials',
        '../scenarios/expand-testing/login-success.js',
        'https://practice.expandtesting.com/login',
        ['auth', 'form', 'smoke'],
        {
          steps: [
            'Open the login page.',
            'Fill the practice credentials.',
            'Submit the form and verify the secure-area state.',
          ],
          expectedResult: 'The secure-area page loads with its success text and logout link.',
          failureModes: [
            'Stable login selectors drift or become ambiguous.',
            'Valid credentials do not reach /secure.',
            'The success state is missing required secure-area elements.',
          ],
        }
      ),
      scenario(
        'register-success',
        'Register a new practice account',
        '../scenarios/expand-testing/register-success.js',
        'https://practice.expandtesting.com/register',
        ['register', 'form', 'stateful-flow', 'multi-page'],
        {
          steps: [
            'Open the registration page.',
            'Submit a fresh username and password.',
            'Verify the login page success flash after registration.',
          ],
          expectedResult: 'Registration succeeds and redirects to the login page with a success flash.',
          failureModes: [
            'Username validation rules reject the generated username unexpectedly.',
            'The registration form no longer submits to the login page.',
            'The success flash is missing after registration.',
          ],
        }
      ),
      scenario(
        'inputs-display-clear',
        'Display and clear input values',
        '../scenarios/expand-testing/inputs-display-clear.js',
        'https://practice.expandtesting.com/inputs',
        ['forms', 'input-state', 'visibility'],
        {
          steps: [
            'Open the inputs practice page.',
            'Fill the fields and display their output values.',
            'Clear the inputs and verify the fields reset.',
          ],
          expectedResult: 'The output panel reflects the entered values and the fields later clear successfully.',
          failureModes: [
            'Displayed output fragments do not match the entered values.',
            'The Clear Inputs action leaves stale values behind.',
            'The page no longer exposes the expected input IDs or action buttons.',
          ],
        }
      ),
      scenario(
        'shadowdom-extraction',
        'Extract content from the practice shadow DOM component',
        '../scenarios/expand-testing/shadowdom-extraction.js',
        'https://practice.expandtesting.com/shadowdom',
        ['shadow-dom', 'extract'],
        {
          steps: [
            'Open the shadow DOM practice page.',
            'Resolve the shadow host and its internal button.',
            'Extract the shadow text and verify the internal button label.',
          ],
          expectedResult: 'The benchmark reads non-empty shadow-root text and finds the button inside the component.',
          failureModes: [
            'The shadow host is missing or closed.',
            'The shadow-root text is empty.',
            'The internal button cannot be found inside the component.',
          ],
        }
      ),
      scenario(
        'iframe-content-extract',
        'Extract content from the Expand Testing iframe practice page',
        '../scenarios/expand-testing/iframe-content-extract.js',
        'https://practice.expandtesting.com/iframe',
        ['iframe', 'extract'],
        {
          steps: [
            'Open the Expand Testing iframe practice page.',
            'Ignore cross-origin advertising or media frames and resolve an accessible internal iframe.',
            'Extract non-empty internal iframe text from the practice content area.',
          ],
          expectedResult: 'The benchmark finds at least one accessible internal iframe and extracts readable content from it.',
          failureModes: [
            'Only cross-origin iframes remain accessible from the page.',
            'The internal practice iframe content is empty.',
            'The page no longer exposes a stable accessible iframe.',
          ],
        }
      ),
    ],
  }),
  qualifiedSite({
    id: 'qa-playground',
    name: 'QA Playground',
    baseUrl: 'https://www.qaplayground.com/practice/forms',
    tags: ['public-practice', 'forms', 'dynamic-waits', 'tables'],
    compliance: {
      reviewStatus: 'qualified',
      publicAccess: true,
      requiresAuthentication: false,
      notes: ['QA Playground is a public automation practice site with structured form, table, and wait exercises.'],
    },
    evidence: {
      sourceLinks: [
        'https://www.qaplayground.com/practice/alerts-dialogs',
        'https://www.qaplayground.com/practice/forms',
        'https://www.qaplayground.com/practice/dynamic-waits',
        'https://www.qaplayground.com/practice/data-table',
        'https://www.qaplayground.com/practice/radio-checkbox',
      ],
      lastReviewedAt: '2026-04-19',
      notes: ['Validated live on 2026-04-18 and 2026-04-19 for toast/modal alerts, multi-field forms, delayed UI states, radio/checkbox control states, and data-table extraction.'],
    },
    scenarios: [
      scenario(
        'alerts-dialogs-toast',
        'Trigger the toast alert and verify its text',
        '../scenarios/qa-playground/alerts-dialogs-toast.js',
        'https://www.qaplayground.com/practice/alerts-dialogs',
        ['dialog', 'toast', 'interaction'],
        {
          steps: [
            'Open the alerts and dialogs practice page.',
            'Trigger the toast alert.',
            'Verify the toast becomes visible with non-empty text.',
          ],
          expectedResult: 'A toast appears in the DOM with readable alert text.',
          failureModes: [
            'The toast trigger button is missing.',
            'The toast never appears after the interaction.',
            'The toast text is empty or malformed.',
          ],
        }
      ),
      scenario(
        'form-submit-success',
        'Submit the practice form successfully',
        '../scenarios/qa-playground/form-submit-success.js',
        'https://www.qaplayground.com/practice/forms',
        ['forms', 'submit', 'smoke'],
        {
          steps: [
            'Open the practice form.',
            'Fill the required fields and submit the form.',
            'Verify the success state and submitted name.',
          ],
          expectedResult: 'The form reaches the success state with the submitted name rendered back to the page.',
          failureModes: [
            'Field locators drift or become ambiguous.',
            'The form submits without showing the success state.',
            'The success state is missing the submitted name.',
          ],
        }
      ),
      scenario(
        'dynamic-waits',
        'Verify delayed visibility and delayed enablement',
        '../scenarios/qa-playground/dynamic-waits.js',
        'https://www.qaplayground.com/practice/dynamic-waits',
        ['dynamic-waits', 'timing', 'visibility'],
        {
          steps: [
            'Open the dynamic waits page.',
            'Trigger delayed element visibility and delayed enablement.',
            'Wait until both states are ready and verify them.',
          ],
          expectedResult: 'The delayed element becomes visible and the delayed button becomes enabled.',
          failureModes: [
            'The trigger buttons disappear or no longer respond.',
            'Delayed states never resolve within the expected time window.',
            'The final visible text or button state is incorrect.',
          ],
        }
      ),
      scenario(
        'radio-checkbox-states',
        'Toggle radio and checkbox controls',
        '../scenarios/qa-playground/radio-checkbox-states.js',
        'https://www.qaplayground.com/practice/radio-checkbox',
        ['radio-checkbox', 'input-state'],
        {
          steps: [
            'Open the radio and checkbox practice page.',
            'Select one radio option and toggle the checkbox controls.',
            'Verify the expected selected and pressed states.',
          ],
          expectedResult: 'The selected radio and toggled checkbox states are reflected back in the DOM.',
          failureModes: [
            'The control locators drift or no longer expose stable test ids.',
            'The selected radio state is not updated after click.',
            'The checkbox controls do not reflect their toggled state.',
          ],
        }
      ),
      scenario(
        'data-table',
        'Extract the practice data table',
        '../scenarios/qa-playground/data-table.js',
        'https://www.qaplayground.com/practice/data-table',
        ['table', 'extract'],
        {
          steps: [
            'Open the data-table page.',
            'Extract headers and sample rows from the table.',
            'Verify row count and representative values.',
          ],
          expectedResult: 'The benchmark returns table headers and a non-trivial row set.',
          failureModes: [
            'The table headers are incomplete.',
            'Too few rows are visible for the practice dataset.',
            'Sample rows resolve to empty values.',
          ],
        }
      ),
    ],
  }),
  qualifiedSite({
    id: 'rpa-challenge',
    name: 'RPA Challenge',
    baseUrl: 'https://rpachallenge.com/',
    tags: ['public-practice', 'dynamic-labels', 'forms'],
    compliance: {
      reviewStatus: 'qualified',
      publicAccess: true,
      requiresAuthentication: false,
      notes: ['RPA Challenge is a public practice site for dynamic-label form completion and repeated task execution.'],
    },
    evidence: {
      sourceLinks: ['https://rpachallenge.com/'],
      lastReviewedAt: '2026-04-18',
      notes: ['Validated live on 2026-04-18 for dynamic label order changes and repeated form submission.'],
    },
    scenarios: [
      scenario(
        'dynamic-label-mapping',
        'Complete the reordered label challenge',
        '../scenarios/rpa-challenge/dynamic-label-mapping.js',
        'https://rpachallenge.com/',
        ['dynamic-labels', 'forms', 'smoke'],
        {
          steps: [
            'Open the challenge page.',
            'Start the challenge.',
            'Map current labels to the provided row data and submit the rows until completion.',
          ],
          expectedResult: 'The challenge reaches its congratulations state after the mapped submissions.',
          failureModes: [
            'Current labels cannot be mapped to the expected data schema.',
            'The challenge stops advancing after a row submission.',
            'The success state never appears after the configured row set.',
          ],
        },
        'qualified',
        { codeQualityEligible: false }
      ),
    ],
  }),
  qualifiedSite({
    id: 'demoqa',
    name: 'DemoQA',
    baseUrl: 'https://demoqa.com/text-box',
    tags: ['public-practice', 'forms', 'tables'],
    compliance: {
      reviewStatus: 'qualified',
      publicAccess: true,
      requiresAuthentication: false,
      notes: ['DemoQA is a public automation practice site. The benchmark only targets the stable, headless-relevant form and table exercises.'],
    },
    evidence: {
      sourceLinks: [
        'https://demoqa.com/text-box',
        'https://demoqa.com/webtables',
        'https://demoqa.com/radio-button',
        'https://demoqa.com/frames',
      ],
      lastReviewedAt: '2026-04-19',
      notes: ['Validated live on 2026-04-18 and 2026-04-19 using domcontentloaded navigation to avoid long-lived network noise on the site, including sample iframe extraction on the Frames page.'],
    },
    scenarios: [
      scenario(
        'radio-button-selection',
        'Select the radio button and verify the reflected result',
        '../scenarios/demoqa/radio-button-selection.js',
        'https://demoqa.com/radio-button',
        ['radio-checkbox', 'forms'],
        {
          steps: [
            'Open the radio-button page.',
            'Select the Yes option.',
            'Verify the result text and disabled state for the No option.',
          ],
          expectedResult: 'The result text echoes Yes and the No option remains disabled.',
          failureModes: [
            'The Yes control is missing or not actionable.',
            'The selected result text is not updated.',
            'The No option is no longer disabled.',
          ],
        },
        'qualified',
        { codeQualityEligible: false }
      ),
      scenario(
        'text-box-submit',
        'Submit the text-box form',
        '../scenarios/demoqa/text-box-submit.js',
        'https://demoqa.com/text-box',
        ['forms', 'submit', 'smoke'],
        {
          steps: [
            'Open the text-box form.',
            'Fill the inputs and submit the form.',
            'Verify the output panel echoes the submitted values.',
          ],
          expectedResult: 'The output panel includes the submitted name, email, and address values.',
          failureModes: [
            'The form fields no longer expose stable IDs.',
            'Submitting the form fails to render the output panel.',
            'The output panel is missing the submitted values.',
          ],
        }
      ),
      scenario(
        'webtables',
        'Filter the web table by employee name',
        '../scenarios/demoqa/webtables.js',
        'https://demoqa.com/webtables',
        ['table', 'search'],
        {
          steps: [
            'Open the web tables page.',
            'Search for Cierra in the table.',
            'Verify the filtered row remains visible.',
          ],
          expectedResult: 'The search narrows the visible table rows to the expected employee.',
          failureModes: [
            'The table search box disappears or changes ID.',
            'Filtering no longer retains the expected row.',
            'The visible row text does not contain the target employee data.',
          ],
        }
      ),
      scenario(
        'frames-sample-extract',
        'Extract sample text from the DemoQA iframe page',
        '../scenarios/demoqa/frames-sample-extract.js',
        'https://demoqa.com/frames',
        ['iframe', 'extract'],
        {
          steps: [
            'Open the DemoQA frames page.',
            'Confirm the page exposes two iframes.',
            'Extract the sample text from one accessible iframe document.',
          ],
          expectedResult: 'The benchmark confirms both iframes exist and returns non-empty sample iframe text.',
          failureModes: [
            'The expected iframe count changes.',
            'The sample iframe document cannot be accessed.',
            'The accessible iframe text is empty.',
          ],
        }
      ),
    ],
  }),
  qualifiedSite({
    id: 'parabank',
    name: 'ParaBank',
    baseUrl: 'https://parabank.parasoft.com/parabank/register.htm',
    tags: ['public-demo', 'stateful-flow', 'banking-sandbox'],
    compliance: {
      reviewStatus: 'qualified',
      publicAccess: true,
      requiresAuthentication: false,
      notes: ['ParaBank is a public demo banking sandbox. The benchmark covers registration and account-opening flows that fit the headless goal.'],
    },
    evidence: {
      sourceLinks: [
        'https://parabank.parasoft.com/parabank/register.htm',
        'https://parabank.parasoft.com/parabank/openaccount.htm',
        'https://parabank.parasoft.com/parabank/transfer.htm',
        'https://parabank.parasoft.com/parabank/billpay.htm',
      ],
      lastReviewedAt: '2026-04-19',
      notes: [
        'Validated live on 2026-04-18 and 2026-04-19 for registration, open-new-account, and transfer-funds flows.',
        'Bill Pay is kept in the registry but currently remains pending because the live page exposed no source-account options during the qualification probe, which caused an internal server error on submit.',
      ],
    },
    scenarios: [
      scenario(
        'register-account-overview',
        'Register a demo customer and verify the account services menu',
        '../scenarios/parabank/register-account-overview.js',
        'https://parabank.parasoft.com/parabank/register.htm',
        ['register', 'stateful-flow', 'smoke'],
        {
          steps: [
            'Open the registration page.',
            'Create a fresh demo customer.',
            'Verify the post-registration account services menu is present.',
          ],
          expectedResult: 'The new customer lands in a logged-in state with account service links such as Accounts Overview.',
          failureModes: [
            'Registration fields drift away from the expected stable selectors.',
            'The registration flow no longer logs the user in.',
            'The account services menu is missing after registration.',
          ],
        },
        'qualified',
        { codeQualityEligible: false }
      ),
      scenario(
        'transfer-funds',
        'Transfer funds between two demo accounts after registration',
        '../scenarios/parabank/transfer-funds.js',
        'https://parabank.parasoft.com/parabank/register.htm',
        ['stateful-flow', 'multi-page'],
        {
          steps: [
            'Open the registration page and create a fresh customer.',
            'Open a second account to create a distinct transfer destination.',
            'Transfer funds and verify the completion state.',
          ],
          expectedResult: 'The transfer completes successfully between distinct ParaBank accounts.',
          failureModes: [
            'The transfer page does not expose distinct source and destination accounts.',
            'Submitting the transfer never reaches the completion state.',
            'The completion view is missing the transferred amount or destination account.',
          ],
        },
        'qualified',
        { codeQualityEligible: false }
      ),
      scenario(
        'open-new-account',
        'Open a new account after registration',
        '../scenarios/parabank/open-new-account.js',
        'https://parabank.parasoft.com/parabank/register.htm',
        ['stateful-flow', 'multi-page'],
        {
          steps: [
            'Register a fresh demo customer.',
            'Navigate to Open New Account.',
            'Submit the open-account form and verify the success state.',
          ],
          expectedResult: 'The sandbox opens a new account and shows the new account number.',
          failureModes: [
            'The Open New Account navigation link disappears after registration.',
            'The open-account submit control is missing.',
            'The success state does not contain the Account Opened confirmation.',
          ],
        },
        'qualified',
        { codeQualityEligible: false }
      ),
      scenario(
        'bill-pay',
        'Complete a bill payment in the demo banking sandbox',
        '../scenarios/parabank/bill-pay.js',
        'https://parabank.parasoft.com/parabank/register.htm',
        ['billing', 'stateful-flow', 'pending'],
        {
          steps: [
            'Register a fresh demo customer.',
            'Navigate to Bill Pay.',
            'Submit a payment and verify the Bill Payment Complete confirmation.',
          ],
          expectedResult: 'When the live sandbox exposes source accounts, the bill-pay flow completes and shows its confirmation.',
          failureModes: [
            'The Bill Pay page exposes no source-account options.',
            'Submitting the payment form returns the sandbox internal error page.',
            'The confirmation page is missing Bill Payment Complete.',
          ],
        },
        'pending'
      ),
    ],
  }),
];
