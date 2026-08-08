/**
 * Naukri SpeedFill - Matcher Module
 * Sub-10ms Fuzzy Label & Field Identifier Engine for Naukri.com
 */

(function() {
  const CONTAINER_SELECTORS = [
    '.drawer-wrapper',
    '.apply-drawer',
    '.chatbot-container',
    '.modal-container',
    'div[class*="modal"]',
    'div[class*="drawer"]',
    'div[class*="apply-container"]',
    'div[class*="applyContainer"]',
    'div[class*="chatbot"]',
    'form[name*="apply"]',
    'form[id*="apply"]',
    'form[class*="apply"]',
    'div.apply-message',
    'div.tuple-apply'
  ];

  const EXCLUDED_CONTAINER_SELECTORS = [
    'form[name="searchForm"]',
    '.nMainNavbar',
    '.search-box',
    '#qsb-keys-sug',
    '#qsb-location-sug',
    '#qsb-experience-sug',
    'header',
    'nav',
    '[role="navigation"]',
    '.header-container',
    '.navbar',
    'footer',
    '[role="contentinfo"]',
    '#login-modal',
    'div[class*="auth-modal"]',
    'div[class*="login-container"]',
    'div[class*="SearchBox"]',
    'div[class*="search-box"]',
    '#feedback-form'
  ];

  const EXCLUDED_ELEMENT_IDS = new Set([
    'qsb-keys-sug',
    'qsb-location-sug',
    'qsb-experience-sug',
    'naukri-search-fill-btn',
    'qsbForm',
    'keyword',
    'location',
    'experience',
    'feedback-input'
  ]);

  const EXCLUDED_ELEMENT_NAMES = new Set([
    'qp',
    'ql',
    'qe',
    'keyword',
    'location',
    'experience',
    'search',
    'qsbKeys',
    'qsbLoc'
  ]);

  // Field dictionary mapping label keywords to profile paths
  const FIELD_MAPPINGS = [
    // Current Role
    { keys: ['current job title', 'current role', 'present position', 'recent job title', 'current designation', 'designation', 'role', 'position', 'job title'], path: 'work.currentRole.jobTitle' },
    { keys: ['current company', 'present company', 'company name', 'company', 'employer', 'organization', 'current employer'], path: 'work.currentRole.company' },
    { keys: ['years of experience', 'years experience', 'total experience', 'experience in years', 'exp', 'total exp', 'overall experience'], path: 'work.currentRole.yearsExperience' },
    { keys: ['current ctc', 'current salary', 'present salary', 'annual ctc', 'current ctc (in lacs)', 'current ctc in lakhs', 'fixed ctc'], path: 'work.currentRole.currentSalary' },

    // Target Role & Skills
    { keys: ['target job title', 'desired role', 'target role', 'desired position', 'role applying for'], path: 'work.targetRole.jobTitle' },
    { keys: ['key skills', 'skills', 'technical skills', 'primary skills', 'core skills', 'skill tags'], path: 'work.targetRole.keySkills' },
    { keys: ['expected ctc', 'expected salary', 'desired salary', 'expected ctc (in lacs)', 'expected ctc in lakhs'], path: 'work.targetRole.expectedSalary' },
    { keys: ['notice period', 'notice period (days)', 'notice', 'how soon can you start', 'availability', 'joining time', 'notice period in days'], path: 'work.targetRole.noticePeriod' },
    { keys: ['target location', 'preferred location', 'desired city', 'preferred work location', 'job location preference'], path: 'work.targetRole.targetLocation' },

    // Personal Details
    { keys: ['first name', 'given name'], path: 'personal.firstName' },
    { keys: ['last name', 'surname', 'family name'], path: 'personal.lastName' },
    { keys: ['full name', 'name', 'your name'], path: 'personal.fullName' },
    { keys: ['email', 'email address', 'official email', 'personal email'], path: 'personal.email' },
    { keys: ['phone', 'mobile', 'contact number', 'phone number', 'mobile number'], path: 'personal.phone' },
    { keys: ['city', 'location', 'current city', 'residence city'], path: 'personal.city' },
    { keys: ['state', 'province'], path: 'personal.state' },
    { keys: ['country'], path: 'personal.country' },
    { keys: ['gender', 'sex'], path: 'personal.gender' },
    { keys: ['marital status'], path: 'personal.maritalStatus' },
    { keys: ['linkedin', 'linkedin profile', 'linkedin url'], path: 'personal.linkedin' },
    { keys: ['github', 'portfolio', 'personal website'], path: 'personal.github' },

    // Education
    { keys: ['highest qualification', 'degree', 'qualification', 'education level', 'course'], path: 'education.degree' },
    { keys: ['field of study', 'major', 'stream', 'specialization', 'branch'], path: 'education.major' },
    { keys: ['university', 'college', 'school', 'institution', 'institute'], path: 'education.university' },
    { keys: ['graduation year', 'year of completion', 'passing year', 'year of passing'], path: 'education.graduationYear' }
  ];

  /**
   * Check if element is inside an excluded parent container
   */
  function isInsideExcludedContainer(el) {
    if (!el) return false;
    for (const selector of EXCLUDED_CONTAINER_SELECTORS) {
      if (el && typeof el.closest === 'function' && el.closest(selector)) return true;
    }
    return false;
  }

  /**
   * Get active job application container
   */
  function getAppContainer(doc) {
    const scope = doc || (typeof document !== 'undefined' ? document : null);
    if (!scope || typeof scope.querySelectorAll !== 'function') return null;

    const EXCLUDED_CHILD_FORMS = '#feedback-form, #login-modal, form[class*="login"], form[name="searchForm"]';
    for (const selector of CONTAINER_SELECTORS) {
      const candidates = scope.querySelectorAll(selector);
      for (const container of candidates) {
        if (!container) continue;
        if (isInsideExcludedContainer(container)) continue;
        if (container.querySelector && container.querySelector(EXCLUDED_CHILD_FORMS) !== null) continue;
        return container;
      }
    }

    if (typeof window !== 'undefined' && window.top !== window.self) {
      const href = (window.location && window.location.href) || '';
      if (
        href.includes('naukri.com/mnjuser/apply') ||
        href.includes('/apply') ||
        href.includes('naukri.com/job-listings')
      ) {
        return scope.body || null;
      }
    }
    return null;
  }

  /**
   * Check if element is a non-application input or search bar
   */
  function isNonApplicationInput(el) {
    if (!el) return true;

    if (isInsideExcludedContainer(el)) return true;

    const id = String(el?.id || '').toLowerCase();
    const name = String(el?.name || '').toLowerCase();
    const role = String(el?.getAttribute ? (el.getAttribute('role') || '') : '').toLowerCase();
    const cls = typeof el.className === 'string'
      ? el.className.toLowerCase()
      : (el.className && typeof el.className.baseVal === 'string' ? el.className.baseVal.toLowerCase() : '');

    if (EXCLUDED_ELEMENT_IDS.has(id)) return true;
    if (EXCLUDED_ELEMENT_NAMES.has(name)) return true;
    if (role === 'searchbox') return true;

    if (id.startsWith('qsb-') || name.startsWith('qsb') || cls.includes('qsb-input')) {
      return true;
    }

    const placeholder = String(el.placeholder || (el.getAttribute ? (el.getAttribute('placeholder') || '') : '')).toLowerCase();
    const ariaLabel = String(el.getAttribute ? (el.getAttribute('aria-label') || '') : '').toLowerCase();

    if (
      ariaLabel.includes('search job') ||
      ariaLabel.includes('search location') ||
      ariaLabel.includes('search skills') ||
      ariaLabel.startsWith('search') ||
      placeholder.includes('skills, designations') ||
      placeholder.includes('enter keyword') ||
      placeholder.includes('enter location') ||
      placeholder.includes('search jobs')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Check if element belongs strictly to Naukri's main top navigation search bar
   */
  function isSearchInput(el) {
    if (!el) return false;

    // If inside an active application container, drawer wrapper, or modal, it is NEVER a header search bar!
    if (typeof el.closest === 'function' && el.closest('.drawer-wrapper, .apply-drawer, .chatbot-container, .modal-container, form[name*="apply"]')) {
      return false;
    }

    if (isNonApplicationInput(el)) return true;

    const searchForm = typeof el.closest === 'function' ? el.closest('form[name="searchForm"], .nMainNavbar, .search-box, nav, header') : null;
    if (searchForm) return true;

    return false;
  }

  /**
   * Helper to safely extract nested value from object path (e.g. 'work.currentRole.jobTitle')
   */
  function getNestedValue(obj, path) {
    if (!obj || !path) return null;
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current[key] === undefined || current[key] === null) return null;
      current = current[key];
    }
    return current;
  }

  /**
   * Find label text associated with a given input element
   */
  function getElementLabelText(el) {
    if (!el) return '';
    let labelTexts = [];
    const doc = el.ownerDocument || (typeof document !== 'undefined' ? document : null);

    // 1. Explicit <label for="id">
    if (el.id && typeof el.id === 'string' && doc && typeof doc.querySelector === 'function') {
      const escapedId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(el.id) : el.id.replace(/([^\w-])/g, '\\$1');
      const labelEl = doc.querySelector(`label[for="${escapedId}"]`);
      if (labelEl && labelEl.textContent) labelTexts.push(labelEl.textContent);
    }

    // 2. Parent <label>
    const parentLabel = typeof el.closest === 'function' ? el.closest('label') : null;
    if (parentLabel && parentLabel.textContent) {
      labelTexts.push(parentLabel.textContent);
    }

    // 3. Preceding / Nearby sibling header or legend or aria-labelledby
    const ariaLabelledBy = el.getAttribute ? el.getAttribute('aria-labelledby') : null;
    if (ariaLabelledBy && typeof ariaLabelledBy === 'string' && doc && typeof doc.getElementById === 'function') {
      const ids = ariaLabelledBy.trim().split(/\s+/);
      for (const id of ids) {
        if (id) {
          const target = doc.getElementById(id);
          if (target && target.textContent) {
            labelTexts.push(target.textContent);
          }
        }
      }
    }

    // 4. aria-label, placeholder, name, id, and data-testid
    if (el.getAttribute && el.getAttribute('aria-label')) labelTexts.push(String(el.getAttribute('aria-label')));
    if (el.getAttribute && el.getAttribute('data-testid')) labelTexts.push(String(el.getAttribute('data-testid')));
    if (el.placeholder) labelTexts.push(String(el.placeholder));
    if (el.name) labelTexts.push(String(el.name));
    if (el.id) labelTexts.push(String(el.id));

    // 5. Closest container section header / legend / question text on Naukri
    if (typeof el.closest === 'function') {
      const container = el.closest('.question-container, .form-group, .input-field, fieldset, form > div, div[class*="Question"], div[class*="field"], div[class*="group"]');
      if (container && typeof container.querySelector === 'function') {
        const header = container.querySelector('h1, h2, h3, h4, legend, label, span[class*="label"], div[class*="header"], p[class*="title"]');
        if (header && header.textContent) labelTexts.push(header.textContent);
      }
    }

    return labelTexts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Match an input element to user profile value
   */
  function matchField(el, profile) {
    if (!profile) return null;

    if (isSearchInput(el)) return null;

    const labelText = getElementLabelText(el);
    if (!labelText) return null;

    // Check direct dictionary mappings
    for (const mapping of FIELD_MAPPINGS) {
      for (const key of mapping.keys) {
        if (labelText.includes(key)) {
          const val = getNestedValue(profile, mapping.path);
          if (val) return { value: val, confidence: 0.95, keyMatched: key };
        }
      }
    }

    // Check screening Q&A bank
    if (profile.screening && Array.isArray(profile.screening)) {
      for (const item of profile.screening) {
        if (!item || typeof item.keywords !== 'string') continue;
        const keywords = item.keywords.toLowerCase().split(',').map(k => k.trim());
        for (const kw of keywords) {
          if (kw && labelText.includes(kw)) {
            return { value: item.answer, confidence: 0.85, keyMatched: kw };
          }
        }
      }
    }

    return null;
  }

  /**
   * Locate Naukri's global search bar container
   */
  function findSearchContainer(doc) {
    const scope = doc || (typeof document !== 'undefined' ? document : null);
    if (!scope || typeof scope.querySelector !== 'function') return null;
    return scope.querySelector('form[name="searchForm"], .nMainNavbar, .search-box, .qsbWrapper, div[class*="qsb"]');
  }

  /**
   * Locate Naukri's keyword (#qsb-keys-sug) and location (#qsb-location-sug) search inputs
   */
  function getSearchInputs(containerOrDoc) {
    const scope = containerOrDoc || (typeof document !== 'undefined' ? document : null);
    if (!scope || typeof scope.querySelector !== 'function') return { keywordInput: null, locationInput: null };

    const keywordInput = scope.querySelector(
      '#qsb-keys-sug, input[name="qp"], input[placeholder*="skills" i], input[placeholder*="designations" i]'
    );
    const locationInput = scope.querySelector(
      '#qsb-location-sug, input[name="ql"], input[placeholder*="location" i]'
    );

    return { keywordInput, locationInput };
  }

  /**
   * Safely extract job title/keywords and target location from profile with fallback unwrap
   */
  function extractSearchFillData(profile) {
    if (!profile) return { keywords: '', location: '' };

    const keywords = String(
      profile.work?.targetRole?.jobTitle ||
      profile.work?.currentRole?.jobTitle ||
      profile.work?.recentJobTitle ||
      profile.recentJobTitle ||
      profile.work?.targetRole?.keySkills ||
      ''
    ).trim();

    const location = String(
      profile.work?.targetRole?.targetLocation ||
      profile.personal?.city ||
      profile.city ||
      ''
    ).trim();

    return { keywords, location };
  }

  /**
   * Check if location hostname is a naukri.com domain
   */
  function isNaukriPage(hostname) {
    if (!hostname) return false;
    const host = String(hostname).toLowerCase().trim();
    return typeof host === 'string' && (host === 'naukri.com' || host.endsWith('.naukri.com'));
  }

  /**
   * Safely set value on HTMLInputElement using native property setter and dispatch React/DOM events
   */
  function setNativeInputValue(input, value) {
    if (!input || value === undefined || value === null) return false;
    if (input && (input.disabled || input.readOnly)) return false;
    const valueStr = String(value);

    const prototype = (typeof window !== 'undefined' && window.HTMLInputElement && window.HTMLInputElement.prototype)
      ? window.HTMLInputElement.prototype
      : (typeof HTMLInputElement !== 'undefined' ? HTMLInputElement.prototype : null);

    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, 'value') : null;
    const setter = descriptor ? descriptor.set : null;

    if (setter) {
      setter.call(input, valueStr);
    } else {
      input.value = valueStr;
    }

    if (input._valueTracker && typeof input._valueTracker.setValue === 'function') {
      input._valueTracker.setValue('');
    }

    const EventClass = (typeof window !== 'undefined' && window.Event) ? window.Event : (typeof Event !== 'undefined' ? Event : null);
    if (EventClass && typeof input.dispatchEvent === 'function') {
      input.dispatchEvent(new EventClass('input', { bubbles: true }));
      input.dispatchEvent(new EventClass('change', { bubbles: true }));
      input.dispatchEvent(new EventClass('blur', { bubbles: true }));
    }

    return true;
  }

  const SpeedFillMatcher = {
    matchField,
    getElementLabelText,
    isSearchInput,
    getAppContainer,
    isInsideExcludedContainer,
    isNonApplicationInput,
    findSearchContainer,
    getSearchInputs,
    extractSearchFillData,
    isNaukriPage,
    setNativeInputValue,
    CONTAINER_SELECTORS,
    EXCLUDED_CONTAINER_SELECTORS,
    EXCLUDED_ELEMENT_IDS,
    EXCLUDED_ELEMENT_NAMES
  };

  if (typeof window !== 'undefined') {
    window.SpeedFillMatcher = SpeedFillMatcher;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpeedFillMatcher;
  }
})();
