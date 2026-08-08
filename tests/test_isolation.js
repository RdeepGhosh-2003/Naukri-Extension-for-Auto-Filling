/**
 * Empirical Test Suite for Container Isolation & Matcher Predicates in Naukri Extension
 * Tests getAppContainer, isInsideExcludedContainer, isNonApplicationInput, isSearchInput, and matchField.
 */

const { createDOM, SimulatedElement } = require('./simulated_dom');

// Initialize DOM environment before loading matcher
createDOM();
const SpeedFillMatcher = require('../scripts/matcher');

// Standard test profile for Naukri.com
const testProfile = {
  personal: {
    firstName: 'Amit',
    lastName: 'Sharma',
    fullName: 'Amit Sharma',
    email: 'amit.sharma@example.com',
    phone: '9876543210',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    gender: 'Male'
  },
  work: {
    currentRole: {
      jobTitle: 'Senior Software Engineer',
      company: 'Tech Mahindra',
      yearsExperience: '6',
      currentSalary: '18 Lacs'
    },
    targetRole: {
      jobTitle: 'Lead Full Stack Engineer',
      keySkills: 'Node.js, React, TypeScript',
      expectedSalary: '25 Lacs',
      noticePeriod: '30 days',
      targetLocation: 'Bengaluru'
    }
  },
  education: {
    degree: 'B.Tech',
    major: 'Computer Science',
    university: 'IIT Madras',
    graduationYear: '2018'
  },
  screening: [
    { keywords: 'relocate, relocation', answer: 'Yes' },
    { keywords: 'comfortable working in shifts', answer: 'Yes' }
  ]
};

let passCount = 0;
let failCount = 0;
const results = [];

function assert(condition, testName, details = '') {
  if (condition) {
    passCount++;
    results.push({ testName, status: 'PASS', details });
    console.log(`✅ [PASS] ${testName}`);
  } else {
    failCount++;
    results.push({ testName, status: 'FAIL', details });
    console.error(`❌ [FAIL] ${testName} - ${details}`);
  }
}

function runTests() {
  console.log('====================================================');
  console.log('STARTING NAUKRI CONTAINER ISOLATION TEST SUITE');
  console.log('====================================================\n');

  // TEST SUITE 1: Non-Application / Search Input Identification
  console.log('--- TEST SUITE 1: Non-Application / Search Input Identification ---');
  
  const searchInputs = [
    { id: 'qsb-keys-sug', name: 'qp', placeholder: 'Enter keyword / designation / companies' },
    { id: 'qsb-location-sug', name: 'ql', placeholder: 'Enter location' },
    { id: 'qsb-experience-sug', name: 'qe', placeholder: 'Select experience' },
    { id: 'naukri-search-fill-btn', name: 'search_fill' },
    { id: 'qsbForm', name: 'search' },
    { id: 'keyword', name: 'keyword', placeholder: 'Search jobs' },
    { id: 'location', name: 'location', placeholder: 'Search location' },
    { id: 'experience', name: 'experience' },
    { id: 'feedback-input', name: 'feedback', placeholder: 'Enter feedback' },
    { id: 'custom-search', name: 'custom_search', role: 'searchbox' },
    { id: 'aria-search', name: 'aria_search', 'aria-label': 'Search jobs by title' }
  ];

  searchInputs.forEach(attr => {
    const el = new SimulatedElement('INPUT', attr);
    const isNonApp = SpeedFillMatcher.isNonApplicationInput(el);
    const isSearch = SpeedFillMatcher.isSearchInput(el);
    const match = SpeedFillMatcher.matchField(el, testProfile);

    assert(
      isNonApp === true && isSearch === true && match === null,
      `Exclusion check for search input #${attr.id || attr.name}`,
      `isNonApp=${isNonApp}, isSearch=${isSearch}, match=${JSON.stringify(match)}`
    );
  });

  // TEST SUITE 2: Excluded Container Hierarchy
  console.log('\n--- TEST SUITE 2: Excluded Container Ancestry ---');

  const doc = createDOM();
  
  // 2.1 Search bar container (form[name="searchForm"])
  const searchForm = new SimulatedElement('FORM', { name: 'searchForm', class: 'search-box' });
  const keyInput = new SimulatedElement('INPUT', { id: 'custom-qsb-key', name: 'custom_qp' });
  searchForm.appendChild(keyInput);
  doc.body.appendChild(searchForm);

  assert(
    SpeedFillMatcher.isInsideExcludedContainer(keyInput) === true,
    'Input inside form[name="searchForm"] is flagged as inside excluded container',
    'Search form input should be excluded'
  );

  assert(
    SpeedFillMatcher.isNonApplicationInput(keyInput) === true,
    'Input inside form[name="searchForm"] is flagged as non-application input',
    'Search form input should be excluded'
  );

  assert(
    SpeedFillMatcher.matchField(keyInput, testProfile) === null,
    'Input inside form[name="searchForm"] returns null matchField',
    'Match should be null'
  );

  // 2.2 Global Navigation Header (.nMainNavbar)
  const navbarHeader = new SimulatedElement('HEADER', { class: 'nMainNavbar' });
  const navInput = new SimulatedElement('INPUT', { id: 'nav-search-input', placeholder: 'Search...' });
  navbarHeader.appendChild(navInput);
  doc.body.appendChild(navbarHeader);

  assert(
    SpeedFillMatcher.isInsideExcludedContainer(navInput) === true,
    'Input inside .nMainNavbar header is flagged as inside excluded container',
    'Header input should be excluded'
  );

  assert(
    SpeedFillMatcher.matchField(navInput, testProfile) === null,
    'Input inside .nMainNavbar returns null matchField',
    'Match should be null'
  );

  // 2.3 Login Modal (#login-modal)
  const loginModal = new SimulatedElement('DIV', { id: 'login-modal', class: 'auth-modal' });
  const loginInput = new SimulatedElement('INPUT', { id: 'login-email-field', name: 'email' });
  loginModal.appendChild(loginInput);
  doc.body.appendChild(loginModal);

  assert(
    SpeedFillMatcher.isInsideExcludedContainer(loginInput) === true,
    'Input inside #login-modal is excluded',
    'Login modal input should be excluded'
  );

  // TEST SUITE 3: Application Container Isolation & Detection
  console.log('\n--- TEST SUITE 3: Application Container Isolation ---');

  // 3.1 Pure search page (No application drawer/modal)
  const docOnlySearch = createDOM();
  const mainSearchNavbar = new SimulatedElement('NAV', { class: 'nMainNavbar' });
  const topSearchForm = new SimulatedElement('FORM', { name: 'searchForm' });
  topSearchForm.appendChild(new SimulatedElement('INPUT', { id: 'qsb-keys-sug' }));
  mainSearchNavbar.appendChild(topSearchForm);
  docOnlySearch.body.appendChild(mainSearchNavbar);

  const containerOnSearchPage = SpeedFillMatcher.getAppContainer(docOnlySearch);
  assert(
    containerOnSearchPage === null,
    'getAppContainer() returns NULL on pure search page (0 container false positive)',
    `Expected null, got: ${containerOnSearchPage ? containerOnSearchPage.tagName : null}`
  );

  // 3.2 Page with Search Bar AND Naukri Application Drawer (.drawer-wrapper)
  const docWithDrawer = createDOM();
  const searchHeader = new SimulatedElement('HEADER', { class: 'nMainNavbar' });
  const sForm = new SimulatedElement('FORM', { name: 'searchForm' });
  sForm.appendChild(new SimulatedElement('INPUT', { id: 'qsb-keys-sug' }));
  searchHeader.appendChild(sForm);
  docWithDrawer.body.appendChild(searchHeader);

  // Naukri Application Drawer Container
  const appDrawer = new SimulatedElement('DIV', { class: 'drawer-wrapper apply-drawer', id: 'naukri-apply-drawer' });
  const applyForm = new SimulatedElement('FORM', { name: 'applyForm', class: 'apply-form' });
  
  const roleInput = new SimulatedElement('INPUT', { id: 'applicant-current-designation', name: 'currentDesignation' });
  const roleLabel = new SimulatedElement('LABEL', { for: 'applicant-current-designation' }, 'Current Designation');
  
  const expInput = new SimulatedElement('INPUT', { id: 'applicant-total-exp', name: 'yearsExperience' });
  const expLabel = new SimulatedElement('LABEL', { for: 'applicant-total-exp' }, 'Years of Experience');

  const emailInput = new SimulatedElement('INPUT', { id: 'applicant-email', name: 'email', type: 'email' });
  const emailLabel = new SimulatedElement('LABEL', { for: 'applicant-email' }, 'Official Email');

  applyForm.appendChild(roleLabel);
  applyForm.appendChild(roleInput);
  applyForm.appendChild(expLabel);
  applyForm.appendChild(expInput);
  applyForm.appendChild(emailLabel);
  applyForm.appendChild(emailInput);

  appDrawer.appendChild(applyForm);
  docWithDrawer.body.appendChild(appDrawer);

  const activeAppContainer = SpeedFillMatcher.getAppContainer(docWithDrawer);
  assert(
    activeAppContainer === appDrawer,
    'getAppContainer() correctly isolates Naukri Application Drawer (.drawer-wrapper) when search bar is present',
    `Isolated container class: ${activeAppContainer ? activeAppContainer.getAttribute('class') : 'none'}`
  );

  // TEST SUITE 4: Field Matching Accuracy inside Application Container
  console.log('\n--- TEST SUITE 4: Field Matching Accuracy inside Application Container ---');

  const roleMatch = SpeedFillMatcher.matchField(roleInput, testProfile);
  assert(
    roleMatch !== null && roleMatch.value === 'Senior Software Engineer',
    'Current Designation field matched correctly inside application drawer',
    `Value: ${roleMatch ? roleMatch.value : 'null'}`
  );

  const expMatch = SpeedFillMatcher.matchField(expInput, testProfile);
  assert(
    expMatch !== null && expMatch.value === '6',
    'Years of Experience field matched correctly inside application drawer',
    `Value: ${expMatch ? expMatch.value : 'null'}`
  );

  const emailMatch = SpeedFillMatcher.matchField(emailInput, testProfile);
  assert(
    emailMatch !== null && emailMatch.value === 'amit.sharma@example.com',
    'Official Email field matched correctly inside application drawer',
    `Value: ${emailMatch ? emailMatch.value : 'null'}`
  );

  // TEST SUITE 5: Isolation Immunity for Application Drawer Inputs
  console.log('\n--- TEST SUITE 5: Isolation Immunity inside Application Drawer ---');

  // Input inside application drawer with ambiguous name or placeholder
  const drawerTargetLocInput = new SimulatedElement('INPUT', { 
    id: 'desired-location-input', 
    name: 'targetLocation',
    placeholder: 'Preferred Work Location' 
  });
  const drawerTargetLocLabel = new SimulatedElement('LABEL', { for: 'desired-location-input' }, 'Target Location');
  applyForm.appendChild(drawerTargetLocLabel);
  applyForm.appendChild(drawerTargetLocInput);

  const isDrawerInputSearch = SpeedFillMatcher.isSearchInput(drawerTargetLocInput);
  const targetLocMatch = SpeedFillMatcher.matchField(drawerTargetLocInput, testProfile);

  assert(
    isDrawerInputSearch === false,
    'Field inside .drawer-wrapper is NOT flagged as header search input (isSearchInput = false)',
    `isSearchInput: ${isDrawerInputSearch}`
  );

  assert(
    targetLocMatch !== null && targetLocMatch.value === 'Bengaluru',
    'Target Location field inside .drawer-wrapper correctly matched to profile targetLocation',
    `Matched value: ${targetLocMatch ? targetLocMatch.value : 'null'}`
  );

  // SUMMARY REPORT
  console.log('\n====================================================');
  console.log(`NAUKRI ISOLATION TEST RESULTS: PASSED=${passCount}, FAILED=${failCount}`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
  return { passCount, failCount, results };
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
