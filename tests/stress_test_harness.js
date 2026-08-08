/**
 * Empirical Stress Test Harness for Naukri Extension
 * Stress-tests container resolution, button injection/positioning, input event dispatches,
 * edge-case isolation, multi-container priority, and fuzzing profile data.
 */

const { createDOM, SimulatedElement } = require('./simulated_dom');
createDOM();
const SpeedFillMatcher = require('../scripts/matcher');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passCount++;
    console.log(`✅ [STRESS PASS] ${testName}`);
  } else {
    failCount++;
    console.error(`❌ [STRESS FAIL] ${testName} - ${details}`);
  }
}

function runStressTests() {
  console.log('====================================================');
  console.log('STARTING EMPIRICAL ADVERSARIAL STRESS TEST SUITE');
  console.log('====================================================\n');

  // --- STRESS CATEGORY 1: Search Container Resolution & Ambiguous Selectors ---
  console.log('--- CATEGORY 1: Search Container & Input Resolution ---');

  // 1.1 Multiple search wrappers on page
  const doc1 = createDOM();
  const topNav = new SimulatedElement('NAV', { class: 'nMainNavbar' });
  const form1 = new SimulatedElement('FORM', { name: 'searchForm' });
  const key1 = new SimulatedElement('INPUT', { id: 'qsb-keys-sug', name: 'qp' });
  form1.appendChild(key1);
  topNav.appendChild(form1);
  doc1.body.appendChild(topNav);

  const foundContainer1 = SpeedFillMatcher.findSearchContainer(doc1);
  assert(
    foundContainer1 !== null && (foundContainer1 === form1 || foundContainer1 === topNav),
    'Locates top search form when nested inside nMainNavbar',
    `Found container tag: ${foundContainer1 ? foundContainer1.tagName : null}`
  );

  const searchInputs1 = SpeedFillMatcher.getSearchInputs(doc1);
  assert(
    searchInputs1.keywordInput === key1,
    'Resolves #qsb-keys-sug nested in top navbar',
    `Found keywordInput ID: ${searchInputs1.keywordInput ? searchInputs1.keywordInput.id : null}`
  );

  // 1.2 Search input by aria-label and placeholder variations
  const doc2 = createDOM();
  const wrapper2 = new SimulatedElement('DIV', { class: 'qsbWrapper' });
  const ariaKeyInput = new SimulatedElement('INPUT', { 'aria-label': 'Search jobs by title' });
  const ariaLocInput = new SimulatedElement('INPUT', { placeholder: 'Search Location' });
  wrapper2.appendChild(ariaKeyInput);
  wrapper2.appendChild(ariaLocLabel = ariaLocInput);
  doc2.body.appendChild(wrapper2);

  const searchInputs2 = SpeedFillMatcher.getSearchInputs(doc2);
  assert(
    searchInputs2.keywordInput === ariaKeyInput,
    'Resolves keyword input by placeholder/aria-label heuristic when IDs missing',
    `Keyword found: ${!!searchInputs2.keywordInput}`
  );

  // --- STRESS CATEGORY 2: Container Isolation & Priority Resolution ---
  console.log('\n--- CATEGORY 2: Container Isolation & Priority Resolution ---');

  // 2.1 Page containing both Drawer AND Modal AND Header
  const doc3 = createDOM();
  const header = new SimulatedElement('HEADER', { class: 'header-container' });
  header.appendChild(new SimulatedElement('INPUT', { id: 'qsb-keys-sug' }));
  doc3.body.appendChild(header);

  const modal = new SimulatedElement('DIV', { class: 'modal-container' });
  modal.appendChild(new SimulatedElement('INPUT', { id: 'modal-email', name: 'email' }));
  doc3.body.appendChild(modal);

  const drawer = new SimulatedElement('DIV', { class: 'drawer-wrapper apply-drawer' });
  drawer.appendChild(new SimulatedElement('INPUT', { id: 'drawer-role', name: 'currentDesignation' }));
  doc3.body.appendChild(drawer);

  const appContainer = SpeedFillMatcher.getAppContainer(doc3);
  assert(
    appContainer === drawer || appContainer === modal,
    'getAppContainer picks valid active app container over header',
    `Picked container class: ${appContainer ? appContainer.getAttribute('class') : null}`
  );

  // 2.2 Input with 'qsb' in ID inside drawer MUST NOT be excluded from drawer matching
  const qsbInDrawer = new SimulatedElement('INPUT', { id: 'drawer-qsb-skill', name: 'keySkills' });
  const qsbLabel = new SimulatedElement('LABEL', { for: 'drawer-qsb-skill' }, 'Key Skills');
  drawer.appendChild(qsbLabel);
  drawer.appendChild(qsbInDrawer);

  const isSearchInDrawer = SpeedFillMatcher.isSearchInput(qsbInDrawer);
  assert(
    isSearchInDrawer === false,
    'Input inside .drawer-wrapper with qsb in ID is NOT misclassified as header search bar',
    `isSearchInput: ${isSearchInDrawer}`
  );

  // --- STRESS CATEGORY 3: Event Dispatching & Native Property Setter ---
  console.log('\n--- CATEGORY 3: Native Value Setter & Event Fuzzing ---');

  const testInput = new SimulatedElement('INPUT', { id: 'test-fuzz-input' });
  const dispatchedEvents = [];
  testInput.dispatchEvent = function(evt) {
    dispatchedEvents.push(evt.type || evt);
    return true;
  };

  // 3.1 Extreme length string & special characters
  const longVal = 'Senior Lead Architect & Principal Engineer — (Specialized in Distributed Systems, Node.js, C++) <script>alert(1)</script>';
  const res1 = SpeedFillMatcher.setNativeInputValue(testInput, longVal);

  assert(
    res1 === true && testInput.value === longVal,
    'setNativeInputValue correctly sets complex string with HTML & special chars',
    `Value matches: ${testInput.value === longVal}`
  );

  assert(
    dispatchedEvents.length === 3 && dispatchedEvents[0] === 'input' && dispatchedEvents[1] === 'change' && dispatchedEvents[2] === 'blur',
    'Dispatches exactly input -> change -> blur event sequence',
    `Events: ${dispatchedEvents.join('->')}`
  );

  // 3.2 Fuzzing empty, numeric, object inputs to setNativeInputValue
  const resEmpty = SpeedFillMatcher.setNativeInputValue(testInput, '');
  assert(resEmpty === true && testInput.value === '', 'Handles empty string value correctly');

  const resNum = SpeedFillMatcher.setNativeInputValue(testInput, 100500);
  assert(resNum === true && testInput.value === '100500', 'Coerces numeric values to string correctly');

  const resUndefined = SpeedFillMatcher.setNativeInputValue(testInput, undefined);
  assert(resUndefined === false, 'Safely rejects undefined input value');

  // --- STRESS CATEGORY 4: Profile Data Extractor Fallback Hierarchy ---
  console.log('\n--- CATEGORY 4: Data Extraction Robustness ---');

  const messyProfile = {
    work: {
      targetRole: { jobTitle: '   ', targetLocation: '  ' },
      currentRole: { jobTitle: ' Backend Tech Lead ' },
      recentJobTitle: 'Dev'
    },
    personal: { city: ' Hyderabad ' }
  };

  const extractedMessy = SpeedFillMatcher.extractSearchFillData(messyProfile);
  assert(
    extractedMessy.keywords === 'Backend Tech Lead' && extractedMessy.location === 'Hyderabad',
    'Trims whitespace and correctly falls back to currentRole when targetRole is whitespace-only',
    `Extracted: ${JSON.stringify(extractedMessy)}`
  );

  // --- SUMMARY REPORT ---
  console.log('\n====================================================');
  console.log(`EMPIRICAL STRESS TEST RESULTS: PASSED=${passCount}, FAILED=${failCount}`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runStressTests();
}

module.exports = { runStressTests };
