/**
 * Unit & Integration Test Suite for Naukri Search Fill Feature
 * Tests Domain Restriction, Search Container Detection, Input Helper Resolution,
 * Profile Storage Data Extraction & Fallbacks, Native Input Population, and Event Dispatching.
 */

const { createDOM, SimulatedElement } = require('./simulated_dom');

// Initialize DOM environment before loading matcher
const doc = createDOM();
const SpeedFillMatcher = require('../scripts/matcher');

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

// Mock chrome.storage.local API
const mockStorage = {};
global.chrome = {
  storage: {
    local: {
      get: function(key, callback) {
        if (key === null) {
          callback(mockStorage);
        } else if (Array.isArray(key)) {
          const res = {};
          key.forEach(k => res[k] = mockStorage[k]);
          callback(res);
        } else if (typeof key === 'string') {
          callback({ [key]: mockStorage[key] });
        } else {
          callback(mockStorage);
        }
      },
      set: function(obj, callback) {
        Object.assign(mockStorage, obj);
        if (callback) callback();
      }
    },
    onChanged: {
      addListener: function() {}
    }
  },
  runtime: {
    getURL: (path) => path,
    sendMessage: (msg, cb) => cb && cb({}),
    onMessage: { addListener: () => {} }
  }
};

function runSearchFillTests() {
  console.log('====================================================');
  console.log('STARTING NAUKRI SEARCH FILL TEST SUITE');
  console.log('====================================================\n');

  // TEST 1: Domain Restriction Guard
  console.log('--- TEST 1: Domain Restriction Guard ---');
  
  const isGooglePage = SpeedFillMatcher.isNaukriPage('google.com');
  assert(
    isGooglePage === false,
    'isNaukriPage returns FALSE on non-naukri.com domain (google.com)',
    `Result: ${isGooglePage}`
  );

  const isIndeedPage = SpeedFillMatcher.isNaukriPage('www.indeed.com');
  assert(
    isIndeedPage === false,
    'isNaukriPage returns FALSE on indeed.com domain',
    `Result: ${isIndeedPage}`
  );

  const isNaukriValid = SpeedFillMatcher.isNaukriPage('www.naukri.com');
  assert(
    isNaukriValid === true,
    'isNaukriPage returns TRUE on www.naukri.com',
    `Result: ${isNaukriValid}`
  );

  const isNaukriSubdomainValid = SpeedFillMatcher.isNaukriPage('mnj.naukri.com');
  assert(
    isNaukriSubdomainValid === true,
    'isNaukriPage returns TRUE on mnj.naukri.com subdomain',
    `Result: ${isNaukriSubdomainValid}`
  );

  // TEST 2: Storage Data Extraction & Fallback Unwrapping
  console.log('\n--- TEST 2: Storage Data Extraction & Fallbacks ---');
  
  // 2.1 Standard Target Role Profile
  const profileStandard = {
    work: {
      targetRole: { jobTitle: 'Senior React Developer', targetLocation: 'Bengaluru' },
      currentRole: { jobTitle: 'Junior Dev', company: 'Acme' },
      recentJobTitle: 'Dev'
    },
    personal: { city: 'Mumbai' }
  };

  const extracted1 = SpeedFillMatcher.extractSearchFillData(profileStandard);
  assert(
    extracted1.keywords === 'Senior React Developer' && extracted1.location === 'Bengaluru',
    'Extract targetRole jobTitle as keywords and targetLocation as location when present',
    `Result: ${JSON.stringify(extracted1)}`
  );

  // 2.2 Empty Target Role with Fallback to currentRole & personal.city
  const profileFallback = {
    work: {
      targetRole: { jobTitle: '', targetLocation: '' },
      currentRole: { jobTitle: 'Full Stack Engineer' },
      recentJobTitle: 'Lead Architect'
    },
    personal: { city: 'Hyderabad' }
  };

  const extracted2 = SpeedFillMatcher.extractSearchFillData(profileFallback);
  assert(
    extracted2.keywords === 'Full Stack Engineer' && extracted2.location === 'Hyderabad',
    'Fallback unwrap to currentRole.jobTitle and personal.city when targetRole is empty',
    `Result: ${JSON.stringify(extracted2)}`
  );

  // 2.3 Top-level unwrapped profile
  const profileTopLevel = {
    recentJobTitle: 'DevOps Engineer',
    city: 'Delhi NCR'
  };

  const extracted3 = SpeedFillMatcher.extractSearchFillData(profileTopLevel);
  assert(
    extracted3.keywords === 'DevOps Engineer' && extracted3.location === 'Delhi NCR',
    'Fallback unwrap to top-level recentJobTitle and city',
    `Result: ${JSON.stringify(extracted3)}`
  );

  // 2.4 Empty profile guard
  const extractedEmpty = SpeedFillMatcher.extractSearchFillData(null);
  assert(
    extractedEmpty.keywords === '' && extractedEmpty.location === '',
    'extractSearchFillData handles null profile returning empty strings',
    `Result: ${JSON.stringify(extractedEmpty)}`
  );

  // TEST 3: Search Bar & Inputs Helper Detection
  console.log('\n--- TEST 3: Search Container & Input Resolution ---');
  
  const testDoc = createDOM();
  const searchForm = new SimulatedElement('FORM', { name: 'searchForm', class: 'search-box' });
  const keywordInput = new SimulatedElement('INPUT', { id: 'qsb-keys-sug', name: 'qp', placeholder: 'Enter skills' });
  const locationInput = new SimulatedElement('INPUT', { id: 'qsb-location-sug', name: 'ql', placeholder: 'Enter location' });
  
  searchForm.appendChild(keywordInput);
  searchForm.appendChild(locationInput);
  testDoc.body.appendChild(searchForm);

  const foundContainer = SpeedFillMatcher.findSearchContainer(testDoc);
  assert(
    foundContainer === searchForm,
    'findSearchContainer locates form[name="searchForm"] search container',
    `Found container name: ${foundContainer ? foundContainer.getAttribute('name') : 'null'}`
  );

  const foundInputs = SpeedFillMatcher.getSearchInputs(testDoc);
  assert(
    foundInputs.keywordInput === keywordInput && foundInputs.locationInput === locationInput,
    'getSearchInputs resolves #qsb-keys-sug and #qsb-location-sug search inputs',
    `keywordInput found: ${!!foundInputs.keywordInput}, locationInput found: ${!!foundInputs.locationInput}`
  );

  // TEST 4: Native Property Setter & React Event Dispatching
  console.log('\n--- TEST 4: Native Input Value Setter & Event Dispatch ---');
  
  const targetKeyInput = new SimulatedElement('INPUT', { id: 'qsb-keys-sug', name: 'qp' });
  let eventsDispatched = [];
  targetKeyInput.dispatchEvent = function(event) {
    const type = typeof event === 'string' ? event : event.type;
    eventsDispatched.push(type);
    return true;
  };
  targetKeyInput._valueTracker = {
    setValue: function(val) {
      targetKeyInput._trackerVal = val;
    }
  };

  const setSuccess = SpeedFillMatcher.setNativeInputValue(targetKeyInput, 'Lead Full Stack Engineer');
  
  assert(
    setSuccess === true && targetKeyInput.value === 'Lead Full Stack Engineer',
    'setNativeInputValue sets search input value correctly',
    `Input value: ${targetKeyInput.value}`
  );

  assert(
    targetKeyInput._trackerVal === '',
    'setNativeInputValue resets _valueTracker.setValue("")',
    `Tracker value: ${targetKeyInput._trackerVal}`
  );

  assert(
    eventsDispatched.includes('input') && eventsDispatched.includes('change') && eventsDispatched.includes('blur'),
    'setNativeInputValue dispatches bubbling input, change, and blur native events',
    `Events dispatched: ${eventsDispatched.join(', ')}`
  );

  // TEST 5: Guarded setter test (disabled/readOnly/null input)
  console.log('\n--- TEST 5: Input Setter Guards ---');
  
  const disabledInput = new SimulatedElement('INPUT', { id: 'disabled-qsb', disabled: true, value: 'old' });
  const setDisabledRes = SpeedFillMatcher.setNativeInputValue(disabledInput, 'new');
  assert(
    setDisabledRes === false && disabledInput.value === 'old',
    'setNativeInputValue returns FALSE and does not modify disabled input',
    `Value: ${disabledInput.value}`
  );

  const readOnlyInput = new SimulatedElement('INPUT', { id: 'readonly-qsb', readOnly: true, value: 'old' });
  const setReadOnlyRes = SpeedFillMatcher.setNativeInputValue(readOnlyInput, 'new');
  assert(
    setReadOnlyRes === false && readOnlyInput.value === 'old',
    'setNativeInputValue returns FALSE and does not modify readOnly input',
    `Value: ${readOnlyInput.value}`
  );

  const setNullValRes = SpeedFillMatcher.setNativeInputValue(targetKeyInput, null);
  assert(
    setNullValRes === false,
    'setNativeInputValue returns FALSE for null value argument',
    `Result: ${setNullValRes}`
  );

  // SUMMARY REPORT
  console.log('\n====================================================');
  console.log(`NAUKRI SEARCH FILL TEST RESULTS: PASSED=${passCount}, FAILED=${failCount}`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
  return { passCount, failCount, results };
}

if (require.main === module) {
  runSearchFillTests();
}

module.exports = { runSearchFillTests };
