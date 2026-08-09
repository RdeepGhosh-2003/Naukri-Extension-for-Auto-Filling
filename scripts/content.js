/**
 * Naukri SpeedFill - Main Content Script
 * Monitors Naukri DOM, auto-fills form inputs, dispatches native React & DOM events,
 * handles Naukri drawers, chatbot screening modals, radio groups, and auto-submit.
 */

(function() {
  let userProfile = null;
  let isObserverActive = false;
  let hasNotifiedCaptcha = false;
  let originalDocumentTitle = document.title;
  let currentJobTitle = 'Unknown Role';
  let currentCompany = 'Unknown Company';
  let _dropdownInjected = false; // hard one-shot guard — prevents MutationObserver loop
  let forceHaltAutomation = false; // Master Kill Switch when missing data detected

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  /**
   * Helper to simulate a complete physical mouse interaction sequence for React components
   */
  function simulateHumanClick(element) {
    if (!element) return;
    const events = ['pointerdown', 'mousedown', 'mouseup', 'click'];
    events.forEach(evType => {
      element.dispatchEvent(new MouseEvent(evType, {
        bubbles: true, cancelable: true, view: window, buttons: 1
      }));
    });
  }

  // Load user profile from chrome.storage.local
  function loadProfile(callback) {
    chrome.storage.local.get(['userProfile'], (result) => {
      if (result && result.userProfile) {
        userProfile = result.userProfile;
      } else {
        fetch(chrome.runtime.getURL('data/default_profile.json'))
          .then(res => res.json())
          .then(data => {
            userProfile = data;
            chrome.storage.local.set({ userProfile: data });
          })
          .catch(err => console.error('[Naukri SpeedFill] Error loading default profile:', err));
      }
      if (callback) callback();
    });
  }

  // Listen for real-time storage changes when user updates profile in popup
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.userProfile) {
      userProfile = changes.userProfile.newValue;
      console.log('[Naukri SpeedFill] User profile updated in real-time!');
    }
  });

  /**
   * Inject value into React & standard DOM input control safely
   */
  function setReactInputValue(el, value) {
    if (!el || value === undefined || value === null) return false;

    // Skip if disabled, readOnly, focused, manually edited, or already filled
    if (
      el.disabled || 
      el.readOnly || 
      document.activeElement === el || 
      el.dataset.speedfillUserEdited === 'true' || 
      el.value === String(value)
    ) {
      return false;
    }

    // Attach listener to track manual user edits
    if (!el.dataset.speedfillListenerAttached) {
      el.addEventListener('input', (e) => {
        if (e.isTrusted) {
          el.dataset.speedfillUserEdited = 'true';
        }
      });
      el.dataset.speedfillListenerAttached = 'true';
    }

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;

    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;

    const isTextArea = el.tagName.toLowerCase() === 'textarea';
    const setter = isTextArea ? nativeTextAreaValueSetter : nativeInputValueSetter;

    if (setter) {
      setter.call(el, String(value));
    } else {
      el.value = String(value);
    }

    // Dispatch synthetic React & DOM state events
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));

    // Visual emerald feedback glow
    if (userProfile?.settings?.highlightFilledFields !== false) {
      el.classList.remove('speedfill-warning');
      el.classList.add('speedfill-highlight');
      setTimeout(() => el.classList.remove('speedfill-highlight'), 2500);
    }

    return true;
  }

  /**
   * Handle dropdown select elements & Naukri suggestor input options
   */
  function setSelectValue(selectEl, value) {
    if (!selectEl || !value) return false;
    if (selectEl.disabled || document.activeElement === selectEl || selectEl.dataset.speedfillUserEdited === 'true') {
      return false;
    }

    const targetVal = String(value).toLowerCase().trim();

    // Standard <select> element
    if (selectEl.tagName.toLowerCase() === 'select') {
      let matchedOption = null;
      for (const option of selectEl.options) {
        const optText = option.textContent.toLowerCase().trim();
        const optVal = option.value.toLowerCase().trim();
        if (optText.includes(targetVal) || optVal.includes(targetVal) || targetVal.includes(optText)) {
          matchedOption = option;
          break;
        }
      }

      if (matchedOption) {
        selectEl.value = matchedOption.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        selectEl.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      }
    }

    return false;
  }

  /**
   * Smart Radio Button Group Handler for Location, Relocation, CTC, & Screening Questions on Naukri
   */
  function handleRadioGroups(containerArg) {
    if (!userProfile) return 0;

    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer(document);
    if (!appContainer) return 0;
    if (window.SpeedFillMatcher?.isInsideExcludedContainer && window.SpeedFillMatcher.isInsideExcludedContainer(appContainer)) return 0;

    let filledCount = 0;
    const userCity = (userProfile.personal?.city || 'Bengaluru').toLowerCase();

    // Find radio group containers within appContainer
    const containers = appContainer.querySelectorAll('fieldset, [role="radiogroup"], .question-container, div[class*="Question"], div[class*="radio-group"]');

    containers.forEach(container => {
      if (window.SpeedFillMatcher?.isNonApplicationInput && window.SpeedFillMatcher.isNonApplicationInput(container)) return;

      const headerEl = container.querySelector('legend, h1, h2, h3, h4, label, [class*="label"], [class*="title"], [class*="header"]');
      const questionText = headerEl ? headerEl.textContent.toLowerCase().trim() : container.textContent.toLowerCase().trim();

      const radioInputs = Array.from(container.querySelectorAll('input[type="radio"]'));
      if (radioInputs.length === 0) return;

      const isAlreadySelected = radioInputs.some(r => r.checked);
      if (isAlreadySelected) return;

      let selectedInput = null;

      // 1. Are you located in [City]?
      if (questionText.includes('are you located in') || questionText.includes('live in') || questionText.includes('based in') || questionText.includes('reside in')) {
        const questionMentionsUserCity = questionText.includes('bengaluru') || questionText.includes('bangalore') || questionText.includes(userCity);

        if (questionMentionsUserCity) {
          selectedInput = radioInputs.find(r => getRadioText(r, appContainer).includes('yes'));
        } else {
          selectedInput = radioInputs.find(r => getRadioText(r, appContainer).includes('no'));
        }
      }

      // 2. Relocation / Commute
      else if (questionText.includes('commute or relocate') || questionText.includes('relocate') || questionText.includes('commute to')) {
        selectedInput = radioInputs.find(r => {
          const txt = getRadioText(r, appContainer);
          return txt.includes('planning to relocate') || txt.includes('make the commute') || txt.includes('yes');
        });
      }

      // 3. Q&A Bank Matching
      else if (userProfile.screening && Array.isArray(userProfile.screening)) {
        for (const item of userProfile.screening) {
          const keywords = item.keywords.toLowerCase().split(',').map(k => k.trim());
          const match = keywords.some(kw => kw && questionText.includes(kw));
          if (match) {
            const ans = item.answer.toLowerCase();
            if (ans.includes('yes') || ans.includes('true')) {
              selectedInput = radioInputs.find(r => getRadioText(r, appContainer).includes('yes'));
            } else if (ans.includes('no') || ans.includes('false')) {
              selectedInput = radioInputs.find(r => getRadioText(r, appContainer).includes('no'));
            }
            break;
          }
        }
      }

      // Execute click if option found
      if (selectedInput && !selectedInput.checked) {
        console.log('[Naukri SpeedFill] Auto-selecting radio option:', getRadioText(selectedInput, appContainer));
        selectedInput.click();
        selectedInput.dispatchEvent(new Event('change', { bubbles: true }));
        filledCount++;
      }
    });

    return filledCount;
  }

  function getRadioText(radio, containerEl) {
    let text = '';
    const scope = containerEl || document;
    if (radio.id) {
      const lbl = scope.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
      if (lbl) text = lbl.textContent;
    }
    if (!text && radio.closest('label')) {
      text = radio.closest('label').textContent;
    }
    if (!text && radio.parentElement) {
      text = radio.parentElement.textContent;
    }
    return text.toLowerCase().trim();
  }

  /**
   * Handle Resume step in Naukri apply drawer
   */
  function handleResumeStep(containerArg) {
    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer(document);
    if (!appContainer) return false;

    const isResumeStep = Array.from(appContainer.querySelectorAll('h1, h2, h3, legend, header, div')).some(el => {
      if (window.SpeedFillMatcher?.isNonApplicationInput && window.SpeedFillMatcher.isNonApplicationInput(el)) return false;
      const txt = el.textContent.toLowerCase().trim();
      return txt.includes('select a resume') || txt.includes('choose a resume') || txt.includes('uploaded resume');
    });

    if (!isResumeStep) return false;

    const resumeCards = Array.from(appContainer.querySelectorAll('[data-testid*="resume"], [class*="resume"], div[role="radio"]'));
    if (resumeCards.length === 0) return false;

    let targetCard = resumeCards[0];

    if (targetCard && !targetCard.classList.contains('selected') && targetCard.getAttribute('aria-checked') !== 'true') {
      console.log('[Naukri SpeedFill] Auto-selecting resume...');
      targetCard.click();
    }

    const delay = userProfile?.settings?.stepDelayMs || 500;
    if (userProfile?.settings?.autoSelectResume !== false || userProfile?.settings?.autoAdvanceStep !== false) {
      clearTimeout(window._speedfillAdvanceTimer);
      window._speedfillAdvanceTimer = setTimeout(() => clickContinueButton(appContainer), delay);
      return true;
    }
    return false;
  }

  /**
   * Detect CAPTCHA and send browser notification
   */
  function detectCaptchaAndNotify() {
    const hasCaptchaElement = document.querySelector('iframe[src*="recaptcha"], iframe[title*="recaptcha"], .g-recaptcha, [class*="captcha"]');
    const bodyText = (document.body?.innerText || document.body?.textContent || '').toLowerCase();
    const hasCaptchaText = bodyText.includes("i'm not a robot") || bodyText.includes("recaptcha");

    if ((hasCaptchaElement || hasCaptchaText) && !hasNotifiedCaptcha) {
      hasNotifiedCaptcha = true;

      if (!document.title.includes('🚨 CAPTCHA REQUIRED')) {
        document.title = `🚨 CAPTCHA REQUIRED - ${originalDocumentTitle}`;
      }

      chrome.runtime.sendMessage({ action: 'notify_captcha' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[Naukri SpeedFill] Captcha notify error:', chrome.runtime.lastError.message);
        }
      });

      const pill = document.getElementById('speedfill-floating-pill');
      if (pill) {
        pill.classList.add('pill-warning');
        pill.innerHTML = `<span>🤖 CAPTCHA Verification Needed!</span>`;
      }
    }
  }

  /**
   * Check for empty/unfilled inputs on the screen that could NOT be matched with dashboard data
   */
  function checkUnmatchedUnfilledFields(containerArg) {
    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer(document);
    if (!appContainer) return 0;

    const inputs = appContainer.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type]), textarea, select'
    );

    let unmatchedCount = 0;

    inputs.forEach(el => {
      if (el.offsetWidth === 0 && el.offsetHeight === 0 || el.disabled || el.readOnly) return;
      if (window.SpeedFillMatcher?.isNonApplicationInput && window.SpeedFillMatcher.isNonApplicationInput(el)) return;
      if (window.SpeedFillMatcher?.isSearchInput(el)) return;

      const isSelect = el.tagName.toLowerCase() === 'select';
      const isValEmpty = isSelect ? !el.value : !el.value.trim();

      if (isValEmpty) {
        const match = window.SpeedFillMatcher?.matchField(el, userProfile);
        if (!match || !match.value) {
          unmatchedCount++;
          el.classList.add('speedfill-warning');
        }
      } else {
        el.classList.remove('speedfill-warning');
      }
    });

    const radioContainers = appContainer.querySelectorAll('fieldset, [role="radiogroup"], .question-container');
    radioContainers.forEach(container => {
      if (window.SpeedFillMatcher?.isNonApplicationInput && window.SpeedFillMatcher.isNonApplicationInput(container)) return;
      const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
      if (radios.length > 0 && !radios.some(r => r.checked)) {
        unmatchedCount++;
        container.classList.add('speedfill-warning');
      } else {
        container.classList.remove('speedfill-warning');
      }
    });

    return unmatchedCount;
  }

  /**
   * Attach interactive listeners so when user manually fills a missing field, auto-advance triggers
   */
  function attachInteractiveAutoAdvanceListeners(containerArg) {
    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer(document) || document.body;
    if (!appContainer || appContainer.dataset.speedfillListenersAttached) return;

    appContainer.addEventListener('change', handleUserManualInput);
    appContainer.addEventListener('input', handleUserManualInput);
    appContainer.addEventListener('click', (e) => {
      if (e.target.tagName.toLowerCase() === 'input' || e.target.type === 'radio') {
        setTimeout(() => handleUserManualInput(e), 100);
      }
    });

    appContainer.dataset.speedfillListenersAttached = 'true';
  }

  function injectSaveButton(container, inputEl = null) {
    if (container.dataset.speedfillSaveInjected) return;
    container.dataset.speedfillSaveInjected = 'true';

    const btn = document.createElement('button');
    btn.className = 'speedfill-save-btn';
    btn.type = 'button';
    btn.innerHTML = '💾 Save to SpeedFill';
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const targetInput = inputEl || container;
      
      let headerEl = null;
      if (inputEl && inputEl.type === 'radio') {
        headerEl = container.querySelector('legend, h1, h2, h3, h4, label, [class*="label"], [class*="title"], [class*="header"]');
      } else {
        headerEl = document.querySelector(`label[for="${CSS.escape(targetInput.id)}"]`) || container.closest('label') || container.previousElementSibling;
      }
      
      let questionText = headerEl ? headerEl.textContent.trim() : '';
      if (!questionText && container.parentElement) questionText = container.parentElement.innerText.split('\n')[0];
      if (!questionText) questionText = 'Unknown Question';

      questionText = questionText.replace(/[^a-zA-Z0-9 ]/g, '').toLowerCase().substring(0, 30).trim();

      let answerText = '';
      if (inputEl && inputEl.type === 'radio') {
        const selected = container.querySelector('input[type="radio"]:checked');
        answerText = selected ? getRadioText(selected) : '';
      } else {
        answerText = targetInput.value;
      }

      if (!answerText) {
        btn.innerHTML = '❌ Empty';
        setTimeout(() => btn.innerHTML = '💾 Save to SpeedFill', 1500);
        return;
      }

      if (userProfile && userProfile.screening) {
        userProfile.screening.push({ keywords: questionText, answer: answerText });
        chrome.storage.local.set({ userProfile: userProfile }, () => {
          btn.innerHTML = '✅ Saved!';
          btn.classList.add('saved');
          btn.disabled = true;
          console.log('[Naukri SpeedFill] Saved new Q&A:', questionText, '->', answerText);
        });
      }
    });

    if (inputEl && inputEl.type === 'radio') {
      const header = container.querySelector('legend, h1, h2, h3, h4');
      if (header) {
        header.appendChild(btn);
      } else {
        container.appendChild(btn);
      }
    } else {
      const wrapper = container.closest('.question-container, .form-group') || container.parentElement;
      if (wrapper && wrapper.nextSibling) {
        wrapper.parentNode.insertBefore(btn, wrapper.nextSibling);
      } else if (wrapper) {
        wrapper.parentNode.appendChild(btn);
      } else {
        container.parentNode.insertBefore(btn, container.nextSibling);
      }
      
      btn.style.display = 'block';
      btn.style.marginTop = '6px';
      btn.style.marginLeft = '0';
    }
  }

  function handleUserManualInput(e) {
    if (e && e.target && e.target.tagName && !e.target.dataset.speedfillSaveInjected) {
      const el = e.target;
      if (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'select') {
        
        const match = window.SpeedFillMatcher?.matchField(el, userProfile);
        if (match !== null && match !== undefined) {
          return; 
        }

        if (el.type !== 'radio' && el.type !== 'checkbox') {
          if (!el.value) return;
          injectSaveButton(el);
        } else if (el.type === 'radio') {
          const container = el.closest('fieldset, [role="radiogroup"], .question-container');
          if (container && !container.dataset.speedfillSaveInjected) {
            injectSaveButton(container, el);
          }
        }
      }
    }

    const appContainer = window.SpeedFillMatcher?.getAppContainer(document);
    const remainingUnmatched = checkUnmatchedUnfilledFields(appContainer);
    updatePillStatus(remainingUnmatched, 0);

    if (remainingUnmatched === 0 && userProfile?.settings?.autoAdvanceStep !== false) {
      console.log('[Naukri SpeedFill] All missing fields completed by user! Auto-advancing step...');
      const delay = userProfile?.settings?.stepDelayMs || 500;
      setTimeout(() => clickContinueButton(appContainer), delay);
    }
  }

  /**
   * Update floating pill widget UI based on fill status & warnings
   */
  function updatePillStatus(unmatchedCount, filledCount) {
    const pill = document.getElementById('speedfill-floating-pill');
    if (!pill) return;

    if (unmatchedCount > 0 && userProfile?.settings?.pauseOnUnmatchedFields !== false) {
      pill.classList.add('pill-warning');
      pill.innerHTML = `<span>⚠️ Review Needed (${unmatchedCount} Unfilled)</span>`;
    } else {
      pill.classList.remove('pill-warning');
      pill.innerHTML = `<span>⚡ Naukri SpeedFill</span><span class="speedfill-badge">Alt + F</span>`;
    }
  }

  /**
   * Find and click final "Submit" / "Apply" button on Naukri
   */
  /**
   * Find and click final "Submit" / "Apply" button on Naukri
   */
  function clickSubmitButton(containerArg) {
    if (forceHaltAutomation && userProfile?.settings?.pauseOnUnmatchedFields !== false) {
      console.warn('[Naukri SpeedFill] Master Kill Switch Active: Aborting clickSubmitButton.');
      return false;
    }

    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer(document);
    if (!appContainer) return false;

    const buttons = Array.from(appContainer.querySelectorAll('button, a[role="button"], input[type="submit"]'));
    const submitBtn = buttons.find(b => {
      if (window.SpeedFillMatcher?.isNonApplicationInput && window.SpeedFillMatcher.isNonApplicationInput(b)) return false;
      const text = b.textContent.toLowerCase().trim();
      const isDisabled = b.disabled || b.getAttribute('aria-disabled') === 'true' || b.classList.contains('disabled');
      return (
        text === 'apply' ||
        text === 'apply now' ||
        text.includes('submit application') ||
        text.includes('submit your application') ||
        text.includes('save & apply')
      ) && !isDisabled;
    });

    if (submitBtn) {
      console.log('[Naukri SpeedFill] Auto-submitting application...');
      chrome.runtime.sendMessage({
        action: 'log_application',
        job: {
          title: currentJobTitle,
          company: currentCompany,
          url: window.location.href.split('?')[0],
          date: new Date().toLocaleDateString() + ', ' + new Date().toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true })
        }
      });

      submitBtn.click();
      return true;
    }
    return false;
  }

  /**
   * Extract job title and company from Naukri DOM
   */
  function extractJobDetailsEarly(containerArg) {
    const scope = containerArg || document;
    const titleEl = scope.querySelector('h1.title, .jd-header-title, .designation-title, h1[title], [class*="jd-header"] h1') || document.querySelector('h1.title, .jd-header-title, .designation-title, h1[title], [class*="jd-header"] h1');
    const companyEl = scope.querySelector('.comp-name, .company-name, [class*="comp-name"], a.pad-rt') || document.querySelector('.comp-name, .company-name, [class*="comp-name"], a.pad-rt');
    
    if (titleEl && titleEl.textContent) {
      const txt = titleEl.textContent.trim();
      if (!txt.toLowerCase().includes('review') && txt.length > 2) {
        currentJobTitle = txt;
      }
    }
    
    if (companyEl && companyEl.textContent) {
      const txt = companyEl.textContent.trim();
      if (txt.length > 1) {
        currentCompany = txt;
      }
    }

    if (currentJobTitle === 'Unknown Role' || currentCompany === 'Unknown Company') {
      const pageTitle = document.title || '';
      let parsedTitle = pageTitle.replace(' - Naukri.com', '').replace('Apply for ', '').replace('Apply: ', '').trim();
      
      if (parsedTitle.includes(' at ')) {
        const parts = parsedTitle.split(' at ');
        if (currentCompany === 'Unknown Company') currentCompany = parts.pop().trim();
        if (currentJobTitle === 'Unknown Role') currentJobTitle = parts.join(' at ').trim();
      } else if (parsedTitle.includes(' - ')) {
        const parts = parsedTitle.split(' - ');
        if (currentCompany === 'Unknown Company') currentCompany = parts.pop().trim();
        if (currentJobTitle === 'Unknown Role') currentJobTitle = parts.join(' - ').trim();
      } else if (parsedTitle && !parsedTitle.toLowerCase().includes('job search')) {
        if (currentJobTitle === 'Unknown Role') currentJobTitle = parsedTitle;
      }
    }
  }

  /**
   * Continuous monitor watching for CAPTCHA resolution & button enablement
   */
  function monitorCaptchaAndSubmit() {
    detectCaptchaAndNotify();

    if (window._captchaMonitorInterval) clearInterval(window._captchaMonitorInterval);

    window._captchaMonitorInterval = setInterval(() => {
      detectCaptchaAndNotify();

      if (forceHaltAutomation && userProfile?.settings?.pauseOnUnmatchedFields !== false) {
        clearInterval(window._captchaMonitorInterval);
        window._captchaMonitorInterval = null;
        return;
      }

      if (userProfile?.settings?.autoSubmitApplication !== false) {
        const appContainer = window.SpeedFillMatcher?.getAppContainer(document);
        if (!appContainer) return;

        if (userProfile?.settings?.pauseOnUnmatchedFields !== false) {
          const unmatched = checkUnmatchedUnfilledFields(appContainer);
          if (unmatched > 0) return;
        }

        const submitted = clickSubmitButton(appContainer);
        if (submitted) {
          clearInterval(window._captchaMonitorInterval);
        }
      }
    }, 100);
  }

  /**
   * Find and trigger the "Continue" or "Next" or "Save and Continue" button on Naukri
   */
  function clickContinueButton(containerArg) {
    clearTimeout(window._speedfillAdvanceTimer);
    if (forceHaltAutomation && userProfile?.settings?.pauseOnUnmatchedFields !== false) {
      console.warn('[Naukri SpeedFill] Master Kill Switch Active: Aborting clickContinueButton.');
      return false;
    }

    const appContainer = containerArg || window.SpeedFillMatcher?.getAppContainer(document);
    if (!appContainer) return false;

    const buttons = Array.from(appContainer.querySelectorAll('button, a[role="button"]'));
    const continueBtn = buttons.find(b => {
      if (window.SpeedFillMatcher?.isNonApplicationInput && window.SpeedFillMatcher.isNonApplicationInput(b)) return false;
      const text = b.textContent.toLowerCase().trim();
      const isDisabled = b.disabled || b.getAttribute('aria-disabled') === 'true';
      return (
        text === 'continue' ||
        text.includes('continue') ||
        text.includes('next') ||
        text.includes('save and continue') ||
        text.includes('save & continue') ||
        text === 'confirm' ||
        text === 'send'
      ) && !isDisabled;
    });

    if (continueBtn) {
      console.log('[Naukri SpeedFill] Auto-advancing step...');
      continueBtn.click();
      return true;
    }
    return false;
  }

  /**
   * Lookup pre-saved or learned answer for a given question string
   */
  function getAnswerForQuestion(qText) {
    if (!qText) return null;
    const cleanQ = String(qText).toLowerCase().trim();

    // 1. Built-in experience check
    if (cleanQ.includes('experience') || cleanQ.includes('years') || cleanQ.includes('yr')) {
      const exp = userProfile?.work?.currentRole?.yearsExperience ||
                  (Array.isArray(userProfile?.savedSearches) && userProfile.savedSearches[0]?.experience);
      if (exp) return exp;
    }

    // 2. Check learnedAnswers object
    if (userProfile?.learnedAnswers && typeof userProfile.learnedAnswers === 'object') {
      if (userProfile.learnedAnswers[cleanQ]) {
        return userProfile.learnedAnswers[cleanQ];
      }
      for (const [key, val] of Object.entries(userProfile.learnedAnswers)) {
        if (key && val && (cleanQ.includes(key.toLowerCase()) || key.toLowerCase().includes(cleanQ))) {
          return val;
        }
      }
    }

    // 3. Check screening Q&A bank
    if (Array.isArray(userProfile?.screening)) {
      for (const item of userProfile.screening) {
        if (!item || typeof item.keywords !== 'string') continue;
        const keywords = item.keywords.toLowerCase().split(',').map(k => k.trim());
        for (const kw of keywords) {
          if (kw && cleanQ.includes(kw)) {
            return item.answer;
          }
        }
      }
    }

    return null;
  }

  /**
   * Core execution function: scan and fill all visible Naukri fields
   */
  function fillCurrentForm() {
    if (!userProfile) {
      loadProfile(() => fillCurrentForm());
      return 0;
    }

    forceHaltAutomation = false; // Reset at start of new form evaluation

    // ── Chatbot UI Support & "Wait & Save" Mechanism ────────────────────────
    const chatInput = document.querySelector('input[placeholder*="Type message here" i]') ||
                      document.querySelector('input[placeholder*="type your answer" i]') ||
                      document.querySelector('input[placeholder*="type here" i]') ||
                      document.querySelector('.chat-input input') ||
                      document.querySelector('[class*="chat" i] input[type="text"]');

    if (chatInput) {
      console.log('[Naukri SpeedFill] Chatbot UI detected on screen.');
      let questionText = '';
      const messageElements = Array.from(document.querySelectorAll('[class*="chat" i] [class*="msg" i], [class*="chat" i] p, [class*="chat" i] span, [class*="question" i], .bot-msg, .chat-msg, div[class*="message" i]'))
        .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0 && el.textContent.trim().length > 0);

      if (messageElements.length > 0) {
        questionText = messageElements[messageElements.length - 1].textContent.toLowerCase().trim();
      } else {
        const container = chatInput.closest('[class*="chat" i], [class*="drawer" i], [class*="modal" i]') || document.body;
        questionText = container.textContent.toLowerCase().trim();
      }

      console.log('[Naukri SpeedFill] Chatbot question detected:', questionText);

      // Search for answer in user profile, learnedAnswers, or screening Q&A bank
      const answerValue = getAnswerForQuestion(questionText);

      const sendBtn = document.querySelector('button[class*="save" i], button[class*="send" i], .send-btn, .save-btn, [class*="sendBtn" i], [class*="saveBtn" i]') ||
                      chatInput.parentElement?.querySelector('button') ||
                      chatInput.closest('form, div[class*="chat" i], div[class*="drawer" i]')?.querySelector('button');

      let answerInjected = false;

      if (answerValue) {
        // MATCH FOUND: Inject stored answer
        chatInput.style.border = "";
        chatInput.style.boxShadow = "";

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;

        if (nativeInputValueSetter) {
          chatInput.focus();
          nativeInputValueSetter.call(chatInput, answerValue);
          chatInput.dispatchEvent(new Event('input', { bubbles: true }));
          chatInput.dispatchEvent(new Event('change', { bubbles: true }));
          chatInput.classList.add('speedfill-highlight');
          setTimeout(() => chatInput.classList.remove('speedfill-highlight'), 2000);
          console.log(`[Naukri SpeedFill] Chatbot UI: Auto-injected known answer "${answerValue}" for question "${questionText}".`);
          answerInjected = true;
        }
      } else {
        // UNKNOWN QUESTION (Master Kill Switch Triggered):
        // 1. Kill all lingering timers & intervals to prevent accidental auto-submits
        forceHaltAutomation = true;
        clearTimeout(window._speedfillSubmitTimer);
        clearTimeout(window._speedfillAdvanceTimer);
        if (window._captchaMonitorInterval) {
          clearInterval(window._captchaMonitorInterval);
          window._captchaMonitorInterval = null;
        }

        console.warn('[Naukri SpeedFill] Master Kill Switch Triggered: Missing data detected. Aborting all auto-advance and auto-submit queues.');

        // 2. Highlight input box with orange warning border to signal manual input required
        chatInput.style.border = "2px solid #ff9800";
        chatInput.style.boxShadow = "0 0 10px rgba(255, 152, 0, 0.5)";

        // 3. Update status pill
        const pill = document.getElementById('speedfill-floating-pill');
        if (pill) {
          pill.classList.add('pill-warning');
          pill.innerHTML = `<span>🛑 Wait & Save: Manual Input Required</span>`;
        }

        // 4. Intercept & Capture when user clicks Save/Send button
        if (sendBtn && !sendBtn.dataset.speedfillIntercepted) {
          sendBtn.dataset.speedfillIntercepted = "true";
          sendBtn.addEventListener('click', function captureUserAnswer() {
            const enteredVal = chatInput.value ? chatInput.value.trim() : '';
            if (enteredVal && questionText) {
              console.log(`[Naukri SpeedFill] Wait & Save: Capturing user answer "${enteredVal}" for question "${questionText}"`);

              if (!userProfile.learnedAnswers) userProfile.learnedAnswers = {};
              userProfile.learnedAnswers[questionText] = enteredVal;

              if (!Array.isArray(userProfile.screening)) userProfile.screening = [];
              const existIdx = userProfile.screening.findIndex(s => s.keywords === questionText);
              if (existIdx >= 0) {
                userProfile.screening[existIdx].answer = enteredVal;
              } else {
                userProfile.screening.push({ keywords: questionText, answer: enteredVal });
              }

              chrome.storage.local.set({ userProfile: userProfile }, () => {
                console.log('[Naukri SpeedFill] Successfully saved learned Q&A pair to Chrome storage.');
                chatInput.style.border = "";
                chatInput.style.boxShadow = "";
                if (pill) {
                  pill.classList.remove('pill-warning');
                  pill.innerHTML = `<span>💾 Answer Saved!</span>`;
                }
              });
            }
          }, { capture: true, once: true });
        }

        console.warn(`[Naukri SpeedFill] Unknown question detected ("${questionText}"). Halting automation for manual input.`);
        return 0; // CRITICAL: Force exit the function entirely right here
      }

      // ONLY execute click if the guard clause was passed and answer was successfully injected
      if (answerInjected && sendBtn && !forceHaltAutomation) {
        console.log('[Naukri SpeedFill] Chatbot UI: Answer injected, auto-clicking Send/Save button with 500ms human delay...');
        setTimeout(() => sendBtn.click(), 500);
        return 1;
      }

      return 0;
    }
    // ─────────────────────────────────────────────────────────────────────────

    const appContainer = window.SpeedFillMatcher?.getAppContainer(document);
    if (!appContainer) {
      console.log('[Naukri SpeedFill] Standing by: No active job application container on screen.');
      return 0;
    }

    extractJobDetailsEarly(appContainer);

    const handledResume = handleResumeStep(appContainer);

    let filledCount = 0;

    filledCount += handleRadioGroups(appContainer);

    const inputs = appContainer.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type]), textarea'
    );

    inputs.forEach(input => {
      if (input.offsetWidth === 0 && input.offsetHeight === 0) return;
      if (window.SpeedFillMatcher?.isNonApplicationInput && window.SpeedFillMatcher.isNonApplicationInput(input)) return;

      if (input.tagName.toLowerCase() === 'textarea' && !input.dataset.speedfillAiInjected) {
        const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`) || input.closest('label');
        const lblTxt = lbl ? lbl.textContent.toLowerCase() : '';
        if (lblTxt.includes('cover letter') || lblTxt.includes('intro') || lblTxt.includes('message to hiring') || lblTxt.includes('additional information')) {
          injectAICoverLetterButton(input);
        }
      }

      const match = window.SpeedFillMatcher?.matchField(input, userProfile);
      if (match && match.value) {
        const success = setReactInputValue(input, match.value);
        if (success) filledCount++;
      }
    });

    const selects = appContainer.querySelectorAll('select');
    selects.forEach(select => {
      if (select.offsetWidth === 0 && select.offsetHeight === 0) return;
      if (window.SpeedFillMatcher?.isNonApplicationInput && window.SpeedFillMatcher.isNonApplicationInput(select)) return;

      const match = window.SpeedFillMatcher?.matchField(select, userProfile);
      if (match && match.value) {
        const success = setSelectValue(select, match.value);
        if (success) filledCount++;
      }
    });

    if (filledCount > 0) {
      console.log(`[Naukri SpeedFill] Auto-filled ${filledCount} application field(s).`);
    }

    attachInteractiveAutoAdvanceListeners(appContainer);

    const unmatchedCount = checkUnmatchedUnfilledFields(appContainer);
    updatePillStatus(unmatchedCount, filledCount);

    const stepDelay = userProfile?.settings?.stepDelayMs !== undefined ? userProfile.settings.stepDelayMs : 150;

    if (unmatchedCount > 0 && userProfile?.settings?.pauseOnUnmatchedFields !== false) {
      forceHaltAutomation = true;
      clearTimeout(window._speedfillSubmitTimer);
      clearTimeout(window._speedfillAdvanceTimer);
      if (window._captchaMonitorInterval) {
        clearInterval(window._captchaMonitorInterval);
        window._captchaMonitorInterval = null;
      }
      console.warn('[Naukri SpeedFill] Master Kill Switch Triggered: Missing data detected. Aborting all auto-advance and auto-submit queues.');
      return filledCount;
    }

    if (forceHaltAutomation) {
      console.warn('[Naukri SpeedFill] Master Kill Switch Active: Aborting auto-submit and auto-advance queues.');
      return filledCount;
    }

    if (userProfile?.settings?.autoSubmitApplication !== false) {
      window._speedfillSubmitTimer = setTimeout(() => clickSubmitButton(appContainer), stepDelay);
      monitorCaptchaAndSubmit();
    }

    if ((userProfile?.settings?.autoAdvanceStep !== false || handledResume) && (filledCount > 0 || handledResume)) {
      window._speedfillAdvanceTimer = setTimeout(() => clickContinueButton(appContainer), stepDelay);
    }

    return filledCount;
  }

  /**
   * Inject a floating role-selector dropdown in the bottom-right corner.
   * Reads targetRole.jobTitle (comma-separated) from the user profile,
   * splits it into individual options, and on selection fills Naukri's
   * search keyword input using React-compatible native setter + events.
   * Does NOT auto-submit or simulate Enter — the user clicks Search manually.
   */
  function injectRoleSearchDropdown() {
    // Hard one-shot guard: prevents MutationObserver or any repeated caller
    // from re-running this and causing a DOM mutation → observer → inject loop.
    if (_dropdownInjected) return;

    // Only run on naukri.com
    const hostname = (typeof window !== 'undefined' && window.location) ? (window.location.hostname || '') : '';
    const isNaukri = window.SpeedFillMatcher?.isNaukriPage
      ? window.SpeedFillMatcher.isNaukriPage(hostname)
      : (hostname && hostname.includes('naukri.com'));
    if (!isNaukri) return;

    // Secondary DOM guard: belt-and-suspenders in case flag somehow bypassed
    if (document.getElementById('naukri-role-search-wrapper') ||
        document.getElementById('naukri-role-search-dropdown')) {
      _dropdownInjected = true;
      return;
    }

    // Mark as injected BEFORE any DOM work so re-entrant calls bail immediately
    _dropdownInjected = true;

    // --- Build wrapper ---
    const wrapper = document.createElement('div');
    wrapper.id = 'naukri-role-search-wrapper';
    wrapper.setAttribute('aria-label', 'SpeedFill Quick Role Search');

    // --- Build <select> ---
    const select = document.createElement('select');
    select.id = 'naukri-role-search-dropdown';
    select.className = 'naukri-role-search-dropdown';
    select.setAttribute('aria-label', 'Select role to search on Naukri');

    // Placeholder option
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '\uD83D\uDE80 Select Role to Search...';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    // Populate role options from profile
    _populateDropdownOptions(select);

    // --- onChange handler: fill Role + Location + Experience in Naukri search bar ---
    select.addEventListener('change', async (e) => {
      // Clear any existing experience polling interval to avoid race conditions on rapid/subsequent selections
      if (window.expPollInterval) {
        clearInterval(window.expPollInterval);
        window.expPollInterval = null;
      }

      if (!e.target.value) return;

      let searchData = {};
      try {
        searchData = JSON.parse(e.target.value);
      } catch (err) {
        console.error('[Naukri SpeedFill] Error parsing dropdown JSON option value:', err);
        return;
      }

      const chosenRole       = String(searchData.role       || '').trim();
      const chosenLocation   = String(searchData.location   || '').trim();
      const chosenExperience = String(searchData.experience || '').trim();

      if (!chosenRole && !chosenLocation && !chosenExperience) return;

      // ── STEP 0: Gentle Wake Up Search Bar ─────────────────────────────────
      // Use native .click() on the search bar wrapper to trigger expansion
      // gently without overwhelming React's synthetic event queue.
      const searchBarWrapper = document.querySelector('#ni-gnb-searchbar, .nI-gNb-sb__main, .nI-gNb-search-bar, .nI-gNb-sb__wrapper, .qsb, .nMainNavbar, input[placeholder*="Search jobs here" i], input[placeholder*="designation" i], input[placeholder*="keyword" i]');

      if (searchBarWrapper) {
        searchBarWrapper.click();
        console.log('[Naukri SpeedFill] Step 0: Gently clicked search bar wrapper to expand UI.');
      } else {
        console.warn('[Naukri SpeedFill] Step 0: Could not find search bar wrapper to wake up React state.');
      }

      // Wait 600ms for React to mount awake state
      await sleep(600);

      // Native React setter — bypasses React's synthetic state wrapper.
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;

      // Helper: focus + native-set + dispatch events for one input field
      function injectReactValue(input, value) {
        if (!input || !value || !nativeInputValueSetter) return false;
        input.focus();
        nativeInputValueSetter.call(input, value);
        input.dispatchEvent(new Event('input',  { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.classList.add('speedfill-highlight');
        setTimeout(() => input.classList.remove('speedfill-highlight'), 2000);
        return true;
      }

      // Helper: Auto-submit search after fields have populated (with human-like delay to evade bot detection)
      function triggerFinalSearch() {
        // Generate a random delay between 1.5 and 2.5 seconds to mimic human reaction time
        const humanDelay = Math.floor(Math.random() * (2500 - 1500 + 1)) + 1500;
        console.log(`[Naukri SpeedFill] Waiting ${humanDelay}ms to evade bot detection...`);

        setTimeout(() => {
          const searchBtn = document.querySelector(
            '.qsbSubmit, #ni-gnb-searchbar button, .nI-gNb-sb__icon-wrapper, ' +
            'button[class*="search-btn" i], .nI-gNb-sb__btn, button[type="submit"]'
          );
          if (searchBtn) {
            console.log('[Naukri SpeedFill] Auto-submitting search...');
            searchBtn.click();
          } else {
            console.warn('[Naukri SpeedFill] Could not find the Search button to auto-submit.');
          }
        }, humanDelay);
      }

      // ── STEP 1A: Inject Role Field ─────────────────────────────────────────
      if (chosenRole) {
        const roleInput =
          document.querySelector('input[placeholder*="designation" i]') ||
          document.querySelector('input[placeholder*="keyword" i]')     ||
          document.querySelector('.qsb input')                          ||
          document.querySelector('input[placeholder*="Search jobs here" i]') ||
          document.querySelector('.suggestor-input')                    ||
          document.querySelector('.nI-gNb-sb__wrapper input')           ||
          document.querySelector('#qsb-keys-sug')                       ||
          document.querySelector('input[name="qp"]');
        if (roleInput) {
          injectReactValue(roleInput, chosenRole);
          console.log(`[Naukri SpeedFill] Step 1A: Role filled: "${chosenRole}"`);
        } else {
          console.warn('[Naukri SpeedFill] Step 1A: Role input not found.');
        }
      }

      // Staggered human pause between Role and Location (300-600ms)
      await sleep(Math.floor(Math.random() * 300) + 300);

      // ── STEP 1B: Inject Location Field ─────────────────────────────────────
      if (chosenLocation) {
        const locationInput =
          document.querySelector('input[placeholder*="location" i]') ||
          document.querySelector('#qsb-location-sug')               ||
          document.querySelector('input[name="ql"]');
        if (locationInput) {
          injectReactValue(locationInput, chosenLocation);
          console.log(`[Naukri SpeedFill] Step 1B: Location filled: "${chosenLocation}"`);
        } else {
          console.warn('[Naukri SpeedFill] Step 1B: Location input not found.');
        }
      }

      // Staggered human pause between Location and Experience (300-600ms)
      await sleep(Math.floor(Math.random() * 300) + 300);

      // ── STEP 2 & STEP 3: Trigger Experience Menu & Polling ─────────────────
      if (chosenExperience) {
        const expInput = document.querySelector('input[placeholder*="experience" i]') ||
                         document.querySelector('.experienceDD input')                ||
                         document.querySelector('.experienceDD')                      ||
                         document.querySelector('#experienceDD')                      ||
                         document.querySelector('.qsbExperience')                     ||
                         document.querySelector('input[name="experience"]')            ||
                         document.querySelector('.nI-gNb-sb__wrapper > div:nth-child(2) input, .nI-gNb-sb__wrapper > div:nth-child(2)');

        if (expInput) {
          const expVal = String(chosenExperience).trim();
          let targetText = '';
          if (expVal === '0') {
            targetText = 'fresher';
          } else if (expVal === '1') {
            targetText = '1 year';
          } else {
            targetText = `${expVal} years`;
          }

          // Value Check (Bypass if Match): If input already displays the target value, skip click and poll
          const currentExpVal = (expInput.value || expInput.getAttribute('value') || expInput.textContent || expInput.parentElement?.textContent || '').toLowerCase();
          if (
            (expVal === '0' && currentExpVal.includes('fresher')) ||
            (expVal !== '0' && (currentExpVal.includes(`${expVal} year`) || currentExpVal.includes(`${expVal} yr`) || currentExpVal.includes(targetText)))
          ) {
            console.log(`[Naukri SpeedFill] Experience field already matches "${targetText}", skipping update.`);
            triggerFinalSearch();
          } else {
            // React State Reset (The Clear Button): Reset state if a clear icon exists
            const parent = expInput.parentElement;
            if (parent) {
              const clearBtn = parent.querySelector('svg, .crossIcon, .clear-icon, .icon-close, [class*="clear" i], [class*="cross" i], [class*="close" i]');
              if (clearBtn) {
                console.log('[Naukri SpeedFill] Found Experience clear icon, resetting React state...');
                simulateHumanClick(clearBtn);
              }
            }

            simulateHumanClick(expInput);
            if (expInput.parentElement) simulateHumanClick(expInput.parentElement);
            console.log('[Naukri SpeedFill] Step 2: Simulated human click on experience input & parentElement.');

            // ── STEP 3: Poll & Select Experience (Dynamic Wait: 100ms interval, 3000ms max) ──
            const startTime = Date.now();
            console.log('[Naukri SpeedFill] Step 3: Looking for experience:', targetText);

            window.expPollInterval = setInterval(() => {
              const listItems = Array.from(document.querySelectorAll('li, div[class*="dropdown" i] span, div[class*="layer" i] span'))
                .filter(el => el.tagName !== 'INPUT' && el.getBoundingClientRect().height > 0);

              const matchedItem = listItems.find(el => {
                const text = el.textContent.toLowerCase().trim();
                const isLeafNode = el.children.length === 0;

                if (!isLeafNode) return false;

                if (expVal === '0') {
                  return text.includes('fresher');
                } else {
                  return text.startsWith(`${expVal} year`) && !text.includes('less than') && !text.includes('fresher');
                }
              });

              if (matchedItem) {
                console.log('[Naukri SpeedFill] Step 3: Found match:', matchedItem.textContent);
                simulateHumanClick(matchedItem);
                clearInterval(window.expPollInterval);
                window.expPollInterval = null;
                triggerFinalSearch();
              } else if (Date.now() - startTime >= 3000) {
                clearInterval(window.expPollInterval);
                window.expPollInterval = null;
                console.warn(`[Naukri SpeedFill] Step 3: Experience dropdown polling timed out for value "${chosenExperience}".`);
                triggerFinalSearch();
              }
            }, 100);
          }

        } else {
          console.warn('[Naukri SpeedFill] Step 2: Experience input not found on page.');
          triggerFinalSearch();
        }
      } else {
        // No experience specified — auto-submit after Role & Location injection
        triggerFinalSearch();
      }

      // Flash wrapper to confirm selection
      wrapper.classList.add('naukri-role-search-wrapper--active');
      setTimeout(() => wrapper.classList.remove('naukri-role-search-wrapper--active'), 600);

      // Reset dropdown to placeholder after brief delay
      setTimeout(() => { select.value = ''; }, 800);

      console.log(`[Naukri SpeedFill] Quick Search: Role="${chosenRole}" | Location="${chosenLocation}" | Exp="${chosenExperience}"`);
    });

    wrapper.appendChild(select);
    document.body.appendChild(wrapper);
    console.log('[Naukri SpeedFill] Role search dropdown injected.');
  }

  /**
   * Populate (or refresh) the role options inside the dropdown.
   * Reads savedSearches[] — array of { role, location, experience } objects.
   * option.value  = JSON.stringify({ role, location, experience })
   * option.text   = "Data Analyst | Bengaluru | 2 Yr"
   * Falls back to comma-split targetRole.jobTitle for backward compatibility.
   */
  function _populateDropdownOptions(selectEl) {
    // Remove all non-placeholder options (index > 0)
    while (selectEl.options.length > 1) {
      selectEl.remove(1);
    }

    const profile = userProfile;
    const searches = Array.isArray(profile?.savedSearches) ? profile.savedSearches : [];

    if (searches.length > 0) {
      searches.forEach((entry) => {
        const opt = document.createElement('option');

        if (entry && typeof entry === 'object') {
          opt.value = JSON.stringify({
            role:       String(entry.role       || '').trim(),
            location:   String(entry.location   || '').trim(),
            experience: String(entry.experience || '').trim()
          });

          const parts = [];
          if (entry.role)       parts.push(String(entry.role).trim());
          if (entry.location)   parts.push(String(entry.location).trim());
          if (entry.experience) parts.push(`${String(entry.experience).trim()} Yr`);
          opt.textContent = parts.length > 0 ? parts.join(' | ') : '(empty)';
        } else {
          // Legacy: plain string entry
          const roleStr = String(entry || '').trim();
          opt.value = JSON.stringify({ role: roleStr, location: '', experience: '' });
          opt.textContent = roleStr || '(empty)';
        }

        selectEl.appendChild(opt);
      });
      return;
    }

    // Ultimate fallback: comma-split targetRole.jobTitle
    const rawRoles =
      profile?.work?.targetRole?.jobTitle ||
      profile?.work?.currentRole?.jobTitle || '';
    const roles = String(rawRoles).split(',').map(r => r.trim()).filter(r => r.length > 0);

    if (roles.length > 0) {
      roles.forEach((role) => {
        const opt = document.createElement('option');
        opt.value = JSON.stringify({ role, location: '', experience: '' });
        opt.textContent = role;
        selectEl.appendChild(opt);
      });
      return;
    }

    // Empty state
    const fallback = document.createElement('option');
    fallback.value = '';
    fallback.disabled = true;
    fallback.textContent = '\u26a0\uFE0F No searches saved \u2014 add in popup';
    selectEl.appendChild(fallback);
  }

  /**
   * Remove the floating role dropdown (cleanup helper)
   */
  function removeRoleSearchDropdown() {
    const wrapper = document.getElementById('naukri-role-search-wrapper');
    if (wrapper && wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  }

  /**
   * Setup MutationObserver to watch for step updates in Naukri's drawer or modal
   */
  function setupDOMObserver() {
    if (isObserverActive) return;

    const observer = new MutationObserver((mutations) => {
      let shouldFill = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          shouldFill = true;
          break;
        }
      }

      if (shouldFill) {
        // NOTE: Do NOT call injectRoleSearchDropdown() here.
        // Injecting a DOM node from inside a MutationObserver that watches
        // childList/subtree causes the observer to fire again immediately,
        // creating an infinite mutation → inject → mutation loop that
        // freezes the main thread. The dropdown is mounted once at init time.
        clearTimeout(window._speedfillTimer);
        window._speedfillTimer = setTimeout(() => {
          if (userProfile?.settings?.autoFillOnLoad !== false) {
            const appContainer = window.SpeedFillMatcher?.getAppContainer(document);
            if (appContainer) {
              fillCurrentForm();
            }
          }
        }, 50);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    isObserverActive = true;
  }

  function injectAICoverLetterButton(textarea) {
    if (textarea.dataset.speedfillAiInjected) return;
    textarea.dataset.speedfillAiInjected = 'true';

    const btn = document.createElement('button');
    btn.className = 'speedfill-ai-btn';
    btn.type = 'button';
    btn.innerHTML = '✨ Generate with AI';
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!userProfile?.settings?.geminiApiKey) {
        alert('Please add your Gemini API Key in the SpeedFill Settings to use the AI Cover Letter Generator.');
        return;
      }
      
      btn.innerHTML = '⏳ Generating...';
      btn.disabled = true;

      chrome.runtime.sendMessage({
        action: 'generate_cover_letter',
        jobTitle: currentJobTitle,
        company: currentCompany,
        profile: userProfile
      }, (response) => {
        btn.disabled = false;
        if (response && response.text) {
          setReactInputValue(textarea, response.text);
          btn.innerHTML = '✅ Generated!';
          setTimeout(() => btn.innerHTML = '✨ Generate with AI', 3000);
        } else {
          btn.innerHTML = '❌ Failed';
          console.error('[Naukri SpeedFill] AI Gen Error:', response?.error);
          alert('Failed to generate cover letter. Check your API key.');
          setTimeout(() => btn.innerHTML = '✨ Generate with AI', 3000);
        }
      });
    });

    textarea.parentNode.insertBefore(btn, textarea);
  }

  /**
   * Create floating widget pill on Naukri page
   */
  function createFloatingPill() {
    if (document.getElementById('speedfill-floating-pill')) return;

    const pill = document.createElement('div');
    pill.id = 'speedfill-floating-pill';
    pill.innerHTML = `
      <span>⚡ Naukri SpeedFill</span>
      <span class="speedfill-badge">Alt + F</span>
    `;

    pill.addEventListener('click', () => {
      const appContainer = window.SpeedFillMatcher?.getAppContainer(document);
      const submitted = clickSubmitButton(appContainer);
      if (!submitted) {
        handleResumeStep(appContainer);
        const count = fillCurrentForm();
        clickContinueButton(appContainer);
        pill.innerHTML = `<span>✅ SpeedFill Active</span>`;
      } else {
        pill.innerHTML = `<span>🚀 Submitted!</span>`;
      }
      setTimeout(() => {
        const unmatched = checkUnmatchedUnfilledFields(appContainer);
        updatePillStatus(unmatched, 0);
      }, 1500);
    });

    document.body.appendChild(pill);
  }

  // Listen for hotkey messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'trigger_autofill') {
      const appContainer = window.SpeedFillMatcher?.getAppContainer(document);
      const submitted = clickSubmitButton(appContainer);
      handleResumeStep(appContainer);
      const filled = submitted ? 0 : fillCurrentForm();
      clickContinueButton(appContainer);
      sendResponse({ status: 'done', filled, submitted });
    }
  });

  // Initialization & Repeated Fill Retries for async React rendering
  loadProfile(() => {
    setupDOMObserver();
    createFloatingPill();

    // Inject dropdown exactly ONCE via a safe deferred timeout.
    // This runs after the current call stack clears, ensuring the DOM
    // observer is already active but the injection itself is outside
    // any observer callback — eliminating the mutation loop.
    setTimeout(injectRoleSearchDropdown, 0);

    // Refresh dropdown options in real-time when user updates profile in popup
    chrome.storage.onChanged.addListener((changes, ns) => {
      if (ns === 'local' && changes.userProfile) {
        const sel = document.getElementById('naukri-role-search-dropdown');
        if (sel) _populateDropdownOptions(sel);
      }
    });

    setTimeout(fillCurrentForm, 100);
    setTimeout(fillCurrentForm, 400);
    setTimeout(fillCurrentForm, 1000);
    monitorCaptchaAndSubmit();
  });

})();
