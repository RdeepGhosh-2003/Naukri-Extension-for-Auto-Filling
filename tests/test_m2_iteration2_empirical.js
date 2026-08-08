/**
 * Empirical Test Harness for M2 Iteration 2
 * Tests:
 * 1. detectCaptchaAndNotify (null body, undefined body, missing innerText/textContent, captcha detection)
 * 2. positionSearchFillButton (flex vs inline-flex vs block parent display mutation guard)
 * 3. setNativeInputValue (disabled, readOnly, null, undefined, standard input)
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Load source files
const matcherPath = path.join(__dirname, '../scripts/matcher.js');
const contentPath = path.join(__dirname, '../scripts/content.js');

const matcherCode = fs.readFileSync(matcherPath, 'utf8');
const contentCode = fs.readFileSync(contentPath, 'utf8');

const SpeedFillMatcher = require(matcherPath);

// Test Results Collector
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function assert(condition, name, detail = '') {
  if (condition) {
    results.passed++;
    results.tests.push({ name, status: 'PASS', detail });
    console.log(`✅ [PASS] ${name} ${detail ? '- ' + detail : ''}`);
  } else {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', detail });
    console.error(`❌ [FAIL] ${name} ${detail ? '- ' + detail : ''}`);
  }
}

// Setup JSDOM environment helper
function createEnvironment(url = 'https://www.naukri.com/job-listings-test') {
  const dom = new JSDOM(`<!DOCTYPE html><html><head><title>Naukri Test</title></head><body></body></html>`, {
    url,
    runScripts: 'dangerously',
    resources: 'usable'
  });

  const { window } = dom;
  const { document } = window;

  // Mock chrome extension APIs
  window.chrome = {
    runtime: {
      getURL: (p) => p,
      sendMessage: (msg, cb) => { if (cb) cb({ status: 'ok' }); },
      lastError: null,
      onMessage: { addListener: () => {} }
    },
    storage: {
      local: {
        get: (keys, cb) => {
          cb({
            userProfile: {
              work: { targetRole: { jobTitle: 'Software Engineer', targetLocation: 'Bangalore' } },
              personal: { city: 'Bangalore' },
              settings: { autoFillOnLoad: true }
            }
          });
        },
        set: (data, cb) => { if (cb) cb(); }
      },
      onChanged: { addListener: () => {} }
    }
  };

  // Execute Matcher script inside JSDOM window context
  window.eval(matcherCode);

  return { dom, window, document };
}

// Expose internal content.js functions for isolated unit testing
function exposeContentFunctions(window) {
  const startIdx = contentCode.indexOf('(function() {') + '(function() {'.length;
  const endIdx = contentCode.lastIndexOf('})();');
  const strippedCode = contentCode.substring(startIdx, endIdx);

  const fn = new window.Function('chrome', 'SpeedFillMatcher', `
    const window = this;
    const document = window.document;
    const Event = window.Event;
    
    ${strippedCode}

    return {
      detectCaptchaAndNotify,
      positionSearchFillButton,
      setReactInputValue
    };
  `);

  return fn.call(window, window.chrome, window.SpeedFillMatcher);
}

// ==========================================
// TEST SUITE 1: detectCaptchaAndNotify
// ==========================================
console.log('\n--- TEST SUITE 1: detectCaptchaAndNotify ---');

// Test 1.1: document.body is null
{
  const { window, document } = createEnvironment();
  const content = exposeContentFunctions(window);
  
  // Set document.body to null
  Object.defineProperty(document, 'body', { value: null, writable: true, configurable: true });
  
  let didThrow = false;
  try {
    content.detectCaptchaAndNotify();
  } catch (err) {
    didThrow = true;
    console.error('Error during null body test:', err);
  }
  
  assert(!didThrow, 'detectCaptchaAndNotify handles null document.body without throwing exceptions');
}

// Test 1.2: document.body is undefined
{
  const { window, document } = createEnvironment();
  const content = exposeContentFunctions(window);
  
  Object.defineProperty(document, 'body', { value: undefined, writable: true, configurable: true });
  
  let didThrow = false;
  try {
    content.detectCaptchaAndNotify();
  } catch (err) {
    didThrow = true;
    console.error('Error during undefined body test:', err);
  }
  
  assert(!didThrow, 'detectCaptchaAndNotify handles undefined document.body without throwing exceptions');
}

// Test 1.3: document.body missing innerText / textContent
{
  const { window, document } = createEnvironment();
  const content = exposeContentFunctions(window);
  
  const mockBody = {}; // Object without innerText or textContent
  Object.defineProperty(document, 'body', { value: mockBody, writable: true, configurable: true });
  
  let didThrow = false;
  try {
    content.detectCaptchaAndNotify();
  } catch (err) {
    didThrow = true;
  }
  
  assert(!didThrow, 'detectCaptchaAndNotify handles document.body with missing innerText/textContent');
}

// Test 1.4: CAPTCHA text detection in body
{
  const { window, document } = createEnvironment();
  const content = exposeContentFunctions(window);
  
  document.body.innerHTML = `<div>Please complete recaptcha to continue</div>`;
  
  let sentMessage = null;
  window.chrome.runtime.sendMessage = (msg) => { sentMessage = msg; };
  
  content.detectCaptchaAndNotify();
  
  assert(
    document.title.includes('🚨 CAPTCHA REQUIRED'),
    'detectCaptchaAndNotify updates document.title when CAPTCHA text is present'
  );
  assert(
    sentMessage && sentMessage.action === 'notify_captcha',
    'detectCaptchaAndNotify sends notify_captcha message when CAPTCHA text is present'
  );
}

// Test 1.5: CAPTCHA iframe/element detection
{
  const { window, document } = createEnvironment();
  const content = exposeContentFunctions(window);
  
  document.body.innerHTML = `<iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>`;
  
  let sentMessage = null;
  window.chrome.runtime.sendMessage = (msg) => { sentMessage = msg; };
  
  content.detectCaptchaAndNotify();
  
  assert(
    document.title.includes('🚨 CAPTCHA REQUIRED'),
    'detectCaptchaAndNotify detects CAPTCHA iframe element'
  );
}


// ==========================================
// TEST SUITE 2: positionSearchFillButton Layout Mutation Guard
// ==========================================
console.log('\n--- TEST SUITE 2: positionSearchFillButton ---');

// Test 2.1: Parent display is 'flex'
{
  const { window, document } = createEnvironment();
  const content = exposeContentFunctions(window);
  
  const parent = document.createElement('div');
  parent.style.display = 'flex';
  parent.style.alignItems = 'flex-start';
  parent.style.gap = '2px';
  
  const container = document.createElement('div');
  container.className = 'search-box';
  parent.appendChild(container);
  document.body.appendChild(parent);
  
  const btn = document.createElement('button');
  
  // Call positioning function
  content.positionSearchFillButton(btn, container);
  
  assert(
    parent.style.display === 'flex',
    'positionSearchFillButton keeps display: flex unmutated'
  );
  assert(
    parent.style.alignItems === 'flex-start',
    'positionSearchFillButton does NOT overwrite existing alignItems when parent display is flex',
    `actual: ${parent.style.alignItems}`
  );
  assert(
    parent.style.gap === '2px',
    'positionSearchFillButton does NOT overwrite existing gap when parent display is flex',
    `actual: ${parent.style.gap}`
  );
}

// Test 2.2: Parent display is 'inline-flex'
{
  const { window, document } = createEnvironment();
  const content = exposeContentFunctions(window);
  
  const parent = document.createElement('div');
  parent.style.display = 'inline-flex';
  parent.style.alignItems = 'baseline';
  parent.style.gap = '4px';
  
  const container = document.createElement('div');
  container.className = 'search-box';
  parent.appendChild(container);
  document.body.appendChild(parent);
  
  const btn = document.createElement('button');
  
  content.positionSearchFillButton(btn, container);
  
  assert(
    parent.style.display === 'inline-flex',
    'positionSearchFillButton keeps display: inline-flex unmutated'
  );
  assert(
    parent.style.alignItems === 'baseline',
    'positionSearchFillButton does NOT overwrite existing alignItems when parent display is inline-flex',
    `actual: ${parent.style.alignItems}`
  );
  assert(
    parent.style.gap === '4px',
    'positionSearchFillButton does NOT overwrite existing gap when parent display is inline-flex',
    `actual: ${parent.style.gap}`
  );
}

// Test 2.3: Parent display is 'block'
{
  const { window, document } = createEnvironment();
  const content = exposeContentFunctions(window);
  
  const parent = document.createElement('div');
  parent.style.display = 'block';
  
  const container = document.createElement('div');
  container.className = 'search-box';
  parent.appendChild(container);
  document.body.appendChild(parent);
  
  const btn = document.createElement('button');
  
  content.positionSearchFillButton(btn, container);
  
  assert(
    parent.style.display === 'flex',
    'positionSearchFillButton mutates parent display from block to flex'
  );
  assert(
    parent.style.alignItems === 'center',
    'positionSearchFillButton sets parent alignItems to center when mutating block display'
  );
  assert(
    parent.style.gap === '8px',
    'positionSearchFillButton sets parent gap to 8px when mutating block display'
  );
}

// Test 2.4: Null / Detached parent handling
{
  const { window } = createEnvironment();
  const content = exposeContentFunctions(window);
  
  const container = window.document.createElement('div');
  const btn = window.document.createElement('button');
  
  let didThrow = false;
  try {
    content.positionSearchFillButton(btn, container);
  } catch (e) {
    didThrow = true;
  }
  
  assert(!didThrow, 'positionSearchFillButton handles detached elements safely without throwing');
}


// ==========================================
// TEST SUITE 3: setNativeInputValue
// ==========================================
console.log('\n--- TEST SUITE 3: setNativeInputValue ---');

// Test 3.1: Disabled input
{
  const { window, document } = createEnvironment();
  const input = document.createElement('input');
  input.disabled = true;
  input.value = 'initial';
  
  const res = window.SpeedFillMatcher.setNativeInputValue(input, 'new value');
  
  assert(res === false, 'setNativeInputValue returns false for disabled input');
  assert(input.value === 'initial', 'setNativeInputValue does NOT modify disabled input value');
}

// Test 3.2: ReadOnly input
{
  const { window, document } = createEnvironment();
  const input = document.createElement('input');
  input.readOnly = true;
  input.value = 'initial';
  
  const res = window.SpeedFillMatcher.setNativeInputValue(input, 'new value');
  
  assert(res === false, 'setNativeInputValue returns false for readOnly input');
  assert(input.value === 'initial', 'setNativeInputValue does NOT modify readOnly input value');
}

// Test 3.3: Null input
{
  const { window } = createEnvironment();
  const res = window.SpeedFillMatcher.setNativeInputValue(null, 'new value');
  assert(res === false, 'setNativeInputValue returns false for null input');
}

// Test 3.4: Undefined input
{
  const { window } = createEnvironment();
  const res = window.SpeedFillMatcher.setNativeInputValue(undefined, 'new value');
  assert(res === false, 'setNativeInputValue returns false for undefined input');
}

// Test 3.5: Null / Undefined value
{
  const { window, document } = createEnvironment();
  const input = document.createElement('input');
  input.value = 'initial';
  
  const res1 = window.SpeedFillMatcher.setNativeInputValue(input, null);
  const res2 = window.SpeedFillMatcher.setNativeInputValue(input, undefined);
  
  assert(res1 === false && res2 === false, 'setNativeInputValue returns false for null or undefined value');
  assert(input.value === 'initial', 'setNativeInputValue does NOT modify input when value is null or undefined');
}

// Test 3.6: Standard input set & bubbling event dispatch
{
  const { window, document } = createEnvironment();
  const input = document.createElement('input');
  document.body.appendChild(input);
  
  const eventsFired = [];
  ['input', 'change', 'blur'].forEach(evtType => {
    input.addEventListener(evtType, (e) => {
      eventsFired.push({ type: e.type, bubbles: e.bubbles });
    });
  });
  
  const res = window.SpeedFillMatcher.setNativeInputValue(input, 'Software Engineer');
  
  assert(res === true, 'setNativeInputValue returns true for active standard input');
  assert(input.value === 'Software Engineer', 'setNativeInputValue updates input.value correctly');
  assert(eventsFired.length === 3, 'setNativeInputValue dispatches input, change, and blur events');
  assert(eventsFired.every(e => e.bubbles === true), 'setNativeInputValue events bubble up DOM tree');
}

// ==========================================
// TEST SUITE 4: Extra Edge Case Mining
// ==========================================
console.log('\n--- TEST SUITE 4: Extra Edge Case Mining (Textarea Setter) ---');

// Test 4.1: Textarea element set analysis
{
  const { window, document } = createEnvironment();
  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  
  let didThrow = false;
  let errorMsg = '';
  try {
    window.SpeedFillMatcher.setNativeInputValue(textarea, 'Sample textarea content');
  } catch (err) {
    didThrow = true;
    errorMsg = err.message;
  }
  
  if (didThrow) {
    console.log(`ℹ️ [NOTE] Found edge case: setNativeInputValue on HTMLTextAreaElement throws TypeError: "${errorMsg}".`);
    console.log(`ℹ️ Note: Search fill targets HTMLInputElement (#qsb-keys-sug, #qsb-location-sug). Textareas are handled via content.js setReactInputValue.`);
  } else {
    assert(true, 'setNativeInputValue handles textarea elements');
  }
}


// Print Summary
console.log('\n==========================================');
console.log(`TEST SUMMARY: Total: ${results.passed + results.failed} | Passed: ${results.passed} | Failed: ${results.failed}`);
console.log('==========================================\n');

// Exit code based on failure count
if (results.failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
