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
  function clickSubmitButton(containerArg) {
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
   * Core execution function: scan and fill all visible Naukri fields
   */
  function fillCurrentForm() {
    if (!userProfile) {
      loadProfile(() => fillCurrentForm());
      return 0;
    }

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
      console.warn(`[Naukri SpeedFill] Pausing auto-advance: ${unmatchedCount} field(s) need manual input/dashboard entry.`);
      return filledCount;
    }

    if (userProfile?.settings?.autoSubmitApplication !== false) {
      setTimeout(() => clickSubmitButton(appContainer), stepDelay);
      monitorCaptchaAndSubmit();
    }

    if ((userProfile?.settings?.autoAdvanceStep !== false || handledResume) && (filledCount > 0 || handledResume)) {
      setTimeout(() => clickContinueButton(appContainer), stepDelay);
    }

    return filledCount;
  }

  /**
   * Inject or remove the "Search Fill" button based on domain and search bar presence
   */
  function injectSearchFillButton() {
    const hostname = (typeof window !== 'undefined' && window.location) ? (window.location.hostname || '') : '';
    const isNaukri = window.SpeedFillMatcher?.isNaukriPage
      ? window.SpeedFillMatcher.isNaukriPage(hostname)
      : (hostname && hostname.includes('naukri.com'));

    // Restrict injection strictly to naukri.com pages
    if (!isNaukri) {
      removeSearchFillButton();
      return null;
    }

    // Find search bar container
    const searchContainer = window.SpeedFillMatcher?.findSearchContainer
      ? window.SpeedFillMatcher.findSearchContainer(document)
      : document.querySelector('form[name="searchForm"], .nMainNavbar, .search-box, .qsbWrapper');

    // If search bar container is absent in DOM, remove/hide injected button
    if (!searchContainer) {
      removeSearchFillButton();
      return null;
    }

    // Check if button already exists
    let existingBtn = document.getElementById('naukri-search-fill-btn');
    if (existingBtn) {
      if (!searchContainer.contains(existingBtn) && existingBtn.parentElement !== searchContainer.parentElement) {
        positionSearchFillButton(existingBtn, searchContainer);
      }
      return existingBtn;
    }

    // Create new button element
    const btn = document.createElement('button');
    btn.id = 'naukri-search-fill-btn';
    btn.className = 'naukri-search-fill-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Search Fill');

    // Naukri search icon SVG inline + text
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg><span>Search Fill</span>`;

    btn.addEventListener('click', handleSearchFillClick);

    positionSearchFillButton(btn, searchContainer);
    return btn;
  }

  function positionSearchFillButton(btn, searchContainer) {
    if (!btn || !searchContainer) return;
    
    // Place button directly after keyword input / search button inside search container
    const keyInput = searchContainer.querySelector('#qsb-keys-sug') || searchContainer;
    if (keyInput && keyInput.parentElement && keyInput !== searchContainer) {
      const qsbForm = searchContainer.querySelector('.qsb-btn, button[type="submit"]') || keyInput.parentElement;
      qsbForm.insertAdjacentElement('afterend', btn);
    } else {
      searchContainer.insertAdjacentElement('afterend', btn);
    }

    // Encourage horizontal alignment if parent is flex/inline-flex
    const parentStyle = searchContainer.parentElement ? window.getComputedStyle(searchContainer.parentElement) : null;
    if (searchContainer.parentElement && !(parentStyle?.display === 'flex' || parentStyle?.display === 'inline-flex')) {
      searchContainer.parentElement.style.display = 'flex';
      searchContainer.parentElement.style.alignItems = 'center';
      searchContainer.parentElement.style.gap = '8px';
    }
  }

  function removeSearchFillButton() {
    const existingBtn = document.getElementById('naukri-search-fill-btn');
    if (existingBtn && existingBtn.parentNode) {
      existingBtn.parentNode.removeChild(existingBtn);
    }
  }

  /**
   * Handle Search Fill button click: read chrome.storage.local userProfile, extract target values, set inputs, dispatch React/DOM events
   */
  function handleSearchFillClick(e) {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(null, (result) => {
        const profile = (result && result.userProfile) ? result.userProfile : (result || userProfile);
        executeSearchFill(profile);
      });
    } else {
      executeSearchFill(userProfile);
    }
  }

  /**
   * Execute search fill using extracted profile data and native setters
   */
  function executeSearchFill(profile) {
    const activeProfile = profile || userProfile;
    const { keywords, location } = window.SpeedFillMatcher?.extractSearchFillData
      ? window.SpeedFillMatcher.extractSearchFillData(activeProfile)
      : {
          keywords: activeProfile?.work?.targetRole?.jobTitle || activeProfile?.work?.currentRole?.jobTitle || activeProfile?.work?.targetRole?.keySkills || '',
          location: activeProfile?.work?.targetRole?.targetLocation || activeProfile?.personal?.city || ''
        };

    const { keywordInput, locationInput } = window.SpeedFillMatcher?.getSearchInputs
      ? window.SpeedFillMatcher.getSearchInputs(document)
      : {
          keywordInput: document.querySelector('#qsb-keys-sug, input[name="qp"]'),
          locationInput: document.querySelector('#qsb-location-sug, input[name="ql"]')
        };

    let filledCount = 0;

    if (keywordInput && keywords) {
      if (window.SpeedFillMatcher?.setNativeInputValue) {
        window.SpeedFillMatcher.setNativeInputValue(keywordInput, keywords);
      } else {
        setReactInputValue(keywordInput, keywords);
      }
      filledCount++;
    }

    if (locationInput && location) {
      if (window.SpeedFillMatcher?.setNativeInputValue) {
        window.SpeedFillMatcher.setNativeInputValue(locationInput, location);
      } else {
        setReactInputValue(locationInput, location);
      }
      filledCount++;
    }

    console.log(`[Naukri SpeedFill] Search Fill executed: ${filledCount} field(s) filled. Keywords="${keywords}", Location="${location}"`);
    return filledCount;
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
        injectSearchFillButton();
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
    injectSearchFillButton();
    setInterval(injectSearchFillButton, 1000);
    
    setTimeout(fillCurrentForm, 100);
    setTimeout(fillCurrentForm, 400);
    setTimeout(fillCurrentForm, 1000);
    monitorCaptchaAndSubmit();
  });

})();
