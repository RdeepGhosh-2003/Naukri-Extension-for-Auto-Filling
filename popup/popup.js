/**
 * Naukri SpeedFill - Popup Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const versionEl = document.getElementById('speedfill-version');
  if (versionEl && chrome.runtime?.getManifest) {
    versionEl.textContent = 'v' + chrome.runtime.getManifest().version;
  }

  // Elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const saveBtn = document.getElementById('save-btn');
  const addQaBtn = document.getElementById('add-qa-btn');
  const resetDefaultsBtn = document.getElementById('reset-defaults-btn');
  const qaContainer = document.getElementById('qa-container');
  const toast = document.getElementById('toast');
  const stepDelayInput = document.getElementById('stepDelayMs');
  const stepDelayDisplay = document.getElementById('stepDelayDisplay');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const colorPalette = document.getElementById('color-palette');
  
  // 14 Curated Professional Vibrant Colors (Tailwind 500/600 shades)
  const presetColors = [
    '#3b82f6', // Blue (Default)
    '#0ea5e9', // Sky
    '#06b6d4', // Cyan
    '#14b8a6', // Teal
    '#10b981', // Emerald
    '#84cc16', // Lime
    '#eab308', // Amber
    '#f97316', // Orange
    '#ef4444', // Red
    '#f43f5e', // Rose
    '#ec4899', // Pink
    '#d946ef', // Fuchsia
    '#8b5cf6', // Violet
    '#6366f1'  // Indigo
  ];

  let currentProfile = {};

  // Slider input listener for live text badge update
  stepDelayInput?.addEventListener('input', (e) => {
    if (stepDelayDisplay) {
      stepDelayDisplay.textContent = `${e.target.value} ms`;
    }
  });

  // Saved Quick Searches: Add New Search button
  document.getElementById('add-search-btn')?.addEventListener('click', () => {
    appendSearchBlock({});
  });

  // Tab Navigation Handler
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId)?.classList.add('active');
    });
  });

  // Load stored profile into UI
  function loadProfileData() {
    chrome.storage.local.get(['userProfile'], (result) => {
      if (result && result.userProfile) {
        currentProfile = result.userProfile;
        populateForm(currentProfile);
        applyTheme(currentProfile.settings?.theme || 'dark');
        applyPrimaryColor(currentProfile.settings?.primaryColor || '#3b82f6');
      } else {
        resetToDefaultJson();
      }
    });
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
      if (themeToggleBtn) themeToggleBtn.textContent = '☀️';
    } else {
      document.body.classList.remove('light-theme');
      if (themeToggleBtn) themeToggleBtn.textContent = '🌙';
    }
    
    // Recalculate text contrast colors for the new theme
    if (currentProfile.settings?.primaryColor) {
      applyPrimaryColor(currentProfile.settings.primaryColor);
    }
  }

  themeToggleBtn?.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-theme');
    const newTheme = isLight ? 'light' : 'dark';
    if (themeToggleBtn) themeToggleBtn.textContent = isLight ? '☀️' : '🌙';
    
    if (!currentProfile.settings) currentProfile.settings = {};
    currentProfile.settings.theme = newTheme;
    chrome.storage.local.set({ userProfile: currentProfile });
  });

  function hexToRgb(hex) {
    if(!hex) return [59, 130, 246]; // default blue
    let c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c = hex.substring(1).split('');
        if(c.length === 3){
            c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c = '0x' + c.join('');
        return [(c>>16)&255, (c>>8)&255, c&255];
    }
    return [59, 130, 246];
  }

  function applyPrimaryColor(color) {
    document.documentElement.style.setProperty('--primary', color);

    // Calculate dynamic safe text colors based on YIQ lightness
    const rgb = hexToRgb(color);
    document.documentElement.style.setProperty('--primary-rgb', `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`);

    const yiq = ((rgb[0]*299)+(rgb[1]*587)+(rgb[2]*114))/1000;
    
    // 1. Contrast text for buttons
    const contrastText = (yiq >= 128) ? '#0f172a' : '#ffffff';
    document.documentElement.style.setProperty('--primary-contrast-text', contrastText);

    // 2. Safe text color for labels
    const isLightMode = document.body.classList.contains('light-theme');
    let safeText = color;
    if (!isLightMode && yiq < 100) safeText = '#ffffff'; // Too dark for dark mode -> white
    if (isLightMode && yiq > 150) safeText = '#0f172a'; // Too light for light mode -> dark slate
    document.documentElement.style.setProperty('--primary-text-safe', safeText);

    // Update palette active state
    if (colorPalette) {
      const dots = colorPalette.querySelectorAll('.color-dot');
      dots.forEach(dot => {
        if (dot.dataset.color.toLowerCase() === color.toLowerCase()) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }
  }

  // Render color palette
  if (colorPalette) {
    presetColors.forEach(color => {
      const dot = document.createElement('div');
      dot.className = 'color-dot';
      dot.style.backgroundColor = color;
      dot.dataset.color = color;
      
      dot.addEventListener('click', () => {
        applyPrimaryColor(color);
        if (!currentProfile.settings) currentProfile.settings = {};
        currentProfile.settings.primaryColor = color;
        chrome.storage.local.set({ userProfile: currentProfile });
      });
      
      colorPalette.appendChild(dot);
    });
  }

  function resetToDefaultJson() {
    fetch(chrome.runtime.getURL('data/default_profile.json'))
      .then(res => res.json())
      .then(data => {
        currentProfile = data;
        chrome.storage.local.set({ userProfile: data }, () => {
          populateForm(data);
          showToast('Profile Reset to Defaults!');
        });
      });
  }

  // Populate HTML inputs from profile object
  function populateForm(profile) {
    // Current Role
    document.getElementById('currentJobTitle').value = profile.work?.currentRole?.jobTitle || '';
    document.getElementById('currentCompany').value = profile.work?.currentRole?.company || '';
    document.getElementById('yearsExperience').value = profile.work?.currentRole?.yearsExperience || '';
    document.getElementById('currentSalary').value = profile.work?.currentRole?.currentSalary || '';

    // Personal
    document.getElementById('fullName').value = profile.personal?.fullName || '';
    document.getElementById('firstName').value = profile.personal?.firstName || '';
    document.getElementById('lastName').value = profile.personal?.lastName || '';
    document.getElementById('email').value = profile.personal?.email || '';
    document.getElementById('phone').value = profile.personal?.phone || '';
    document.getElementById('city').value = profile.personal?.city || '';
    if (document.getElementById('gender')) document.getElementById('gender').value = profile.personal?.gender || '';
    document.getElementById('linkedin').value = profile.personal?.linkedin || '';
    document.getElementById('coverLetterInstructions').value = profile.personal?.coverLetterInstructions || '';

    // Education
    document.getElementById('degree').value = profile.education?.degree || '';
    document.getElementById('major').value = profile.education?.major || '';
    document.getElementById('university').value = profile.education?.university || '';
    document.getElementById('graduationYear').value = profile.education?.graduationYear || '';

    // Settings
    document.getElementById('autoFillOnLoad').checked = profile.settings?.autoFillOnLoad !== false;
    document.getElementById('pauseOnUnmatchedFields').checked = profile.settings?.pauseOnUnmatchedFields !== false;
    document.getElementById('autoSelectResume').checked = profile.settings?.autoSelectResume !== false;
    document.getElementById('autoAdvanceStep').checked = profile.settings?.autoAdvanceStep !== false;
    document.getElementById('autoSubmitApplication').checked = profile.settings?.autoSubmitApplication !== false;
    document.getElementById('highlightFilledFields').checked = profile.settings?.highlightFilledFields !== false;
    document.getElementById('geminiApiKey').value = profile.settings?.geminiApiKey || '';

    const delayVal = profile.settings?.stepDelayMs !== undefined ? profile.settings.stepDelayMs : 500;
    if (stepDelayInput) stepDelayInput.value = delayVal;
    if (stepDelayDisplay) stepDelayDisplay.textContent = `${delayVal} ms`;

    // Q&A Bank
    renderQaCards(profile.screening || []);

    // Saved Quick Searches — render dynamic blocks
    renderSearchBlocks(
      Array.isArray(profile.savedSearches) ? profile.savedSearches : []
    );
  }

  /**
   * Render all search-block cards from an array of { role, location, experience } objects.
   */
  function renderSearchBlocks(searches) {
    const container = document.getElementById('saved-searches-container');
    if (!container) return;
    container.innerHTML = '';
    const list = searches.length > 0 ? searches : [{}]; // always at least 1 empty block
    list.forEach(item => appendSearchBlock(item));
  }

  /**
   * Append a single styled search-block card to #saved-searches-container.
   * Design mirrors the "Target Role & Skills" card (same form-group, form-grid classes).
   */
  function appendSearchBlock(item = {}) {
    const container = document.getElementById('saved-searches-container');
    if (!container) return;

    const block = document.createElement('div');
    block.className = 'search-block';
    block.style.cssText = [
      'margin-bottom:10px',
      'padding:14px 16px',
      'background:var(--bg-input)',
      'border:1px solid rgba(56,189,248,0.25)',
      'border-radius:var(--radius-sm)',
      'position:relative'
    ].join(';');

    const blockNum = container.querySelectorAll('.search-block').length + 1;

    block.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span class="search-block-label" style="font-size:12px;font-weight:700;color:#38bdf8;letter-spacing:0.3px;">
          🔍 Search #${blockNum}
        </span>
        <button class="delete-search-btn" type="button"
          style="background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.3);
                 color:#f87171;border-radius:6px;padding:3px 9px;font-size:11px;
                 cursor:pointer;line-height:1.4;">
          🗑️ Remove
        </button>
      </div>
      <div class="form-group">
        <label>Target Job Title / Role</label>
        <input type="text" class="ss-role"
          value="${escapeHtml(item.role || '')}"
          placeholder="e.g. Data Analyst">
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>Location</label>
          <input type="text" class="ss-location"
            value="${escapeHtml(item.location || '')}"
            placeholder="e.g. Bengaluru">
        </div>
        <div class="form-group">
          <label>Experience (Years)</label>
          <input type="text" class="ss-experience"
            value="${escapeHtml(item.experience || '')}"
            placeholder="e.g. 2">
        </div>
      </div>
    `;

    // Remove this block and re-number remaining ones
    block.querySelector('.delete-search-btn').addEventListener('click', () => {
      block.remove();
      container.querySelectorAll('.search-block').forEach((b, i) => {
        const lbl = b.querySelector('.search-block-label');
        if (lbl) lbl.textContent = `🔍 Search #${i + 1}`;
      });
    });

    container.appendChild(block);
  }

  // Render Q&A screening cards
  function renderQaCards(screeningList) {
    qaContainer.innerHTML = '';
    screeningList.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'qa-card';
      card.innerHTML = `
        <button class="delete-btn" data-index="${index}">✕</button>
        <div class="form-group">
          <label>Question Keywords (comma separated)</label>
          <input type="text" class="qa-keywords" value="${escapeHtml(item.keywords)}" placeholder="e.g. ctc, notice period, relocation">
        </div>
        <div class="form-group">
          <label>Pre-Saved Answer</label>
          <input type="text" class="qa-answer" value="${escapeHtml(item.answer)}" placeholder="e.g. 30 Days / 12 Lakhs">
        </div>
      `;
      qaContainer.appendChild(card);
    });

    // Delete event handlers
    qaContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'));
        currentProfile.screening.splice(idx, 1);
        renderQaCards(currentProfile.screening);
      });
    });
  }

  // Add new blank Q&A item
  addQaBtn?.addEventListener('click', () => {
    if (!currentProfile.screening) currentProfile.screening = [];
    currentProfile.screening.push({ keywords: '', answer: '' });
    renderQaCards(currentProfile.screening);
  });

  resetDefaultsBtn?.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset profile to defaults (Naukri Profile)?')) {
      resetToDefaultJson();
    }
  });

  // Extract form input data and save to chrome.storage.local
  saveBtn.addEventListener('click', () => {
    const qaCards = qaContainer.querySelectorAll('.qa-card');
    const updatedScreening = [];
    qaCards.forEach(card => {
      const kw = card.querySelector('.qa-keywords').value;
      const ans = card.querySelector('.qa-answer').value;
      if (kw || ans) {
        updatedScreening.push({ keywords: kw, answer: ans });
      }
    });

    const parsedDelay = parseInt(document.getElementById('stepDelayMs').value, 10);
    const currSalaryVal = document.getElementById('currentSalary').value.trim();

    // Saved Quick Searches — collect { role, location, experience } objects from blocks
    const searchBlocks = document.querySelectorAll('#saved-searches-container .search-block');
    const savedSearches = Array.from(searchBlocks)
      .map(block => ({
        role:       block.querySelector('.ss-role')?.value.trim()       || '',
        location:   block.querySelector('.ss-location')?.value.trim()   || '',
        experience: block.querySelector('.ss-experience')?.value.trim() || ''
      }))
      .filter(s => s.role || s.location || s.experience);

    const updatedProfile = {
      work: {
        currentRole: {
          jobTitle: document.getElementById('currentJobTitle').value.trim(),
          company: document.getElementById('currentCompany').value.trim(),
          yearsExperience: document.getElementById('yearsExperience').value.trim(),
          currentSalary: currSalaryVal,
          currentSalaryLakhs: currSalaryVal.replace(/[^0-9.]/g, '')
        }
      },
      personal: {
        fullName: document.getElementById('fullName').value.trim(),
        firstName: document.getElementById('firstName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        city: document.getElementById('city').value.trim(),
        gender: document.getElementById('gender') ? document.getElementById('gender').value.trim() : 'Male',
        linkedin: document.getElementById('linkedin').value.trim(),
        coverLetterInstructions: document.getElementById('coverLetterInstructions').value.trim()
      },
      education: {
        degree: document.getElementById('degree').value.trim(),
        major: document.getElementById('major').value.trim(),
        university: document.getElementById('university').value.trim(),
        graduationYear: document.getElementById('graduationYear').value.trim()
      },
      screening: updatedScreening,
      savedSearches: savedSearches,
      settings: {
        autoFillOnLoad: document.getElementById('autoFillOnLoad').checked,
        pauseOnUnmatchedFields: document.getElementById('pauseOnUnmatchedFields').checked,
        stepDelayMs: isNaN(parsedDelay) ? 500 : parsedDelay,
        autoSelectResume: document.getElementById('autoSelectResume').checked,
        autoAdvanceStep: document.getElementById('autoAdvanceStep').checked,
        autoSubmitApplication: document.getElementById('autoSubmitApplication').checked,
        highlightFilledFields: document.getElementById('highlightFilledFields').checked,
        geminiApiKey: document.getElementById('geminiApiKey').value.trim(),
        theme: currentProfile.settings?.theme || 'dark',
        primaryColor: currentProfile.settings?.primaryColor || '#3b82f6'
      }
    };

    chrome.storage.local.set({ userProfile: updatedProfile }, () => {
      currentProfile = updatedProfile;
      showToast('Naukri Profile Saved Successfully!');
    });
  });

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;');
  }

  // Load Applied Jobs Logs
  function loadLogs() {
    chrome.storage.local.get(['appliedJobs'], (result) => {
      const logs = result.appliedJobs || [];
      document.getElementById('total-applications-count').textContent = logs.length;
      
      // Calculate Stats
      let todayCount = 0;
      let weekCount = 0;
      let monthCount = 0;

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const oneDay = 24 * 60 * 60 * 1000;
      const weekStart = new Date(today.getTime() - (today.getDay() * oneDay)); 
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      logs.forEach(log => {
        if (!log.date) return;
        const dateStr = log.date.split(',')[0].trim();
        const parts = dateStr.split('/');
        if (parts.length === 3) {
           const logDate = new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
           if (logDate >= today) todayCount++;
           if (logDate >= weekStart) weekCount++;
           if (logDate >= monthStart) monthCount++;
        }
      });

      const elToday = document.getElementById('stat-today');
      const elWeek = document.getElementById('stat-week');
      const elMonth = document.getElementById('stat-month');
      if(elToday) elToday.textContent = todayCount;
      if(elWeek) elWeek.textContent = weekCount;
      if(elMonth) elMonth.textContent = monthCount;

      // Reusable graph renderer
      function renderGraph(containerId, numDays, wrapperClass = '') {
        const graphContainer = document.getElementById(containerId);
        if (!graphContainer) return;
        graphContainer.innerHTML = '';
        
        const daysLabel = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        const dailyCounts = new Array(numDays).fill(0);
        
        for (let i = numDays - 1; i >= 0; i--) {
          const targetDate = new Date(today.getTime() - (i * oneDay));
          
          let count = 0;
          logs.forEach(log => {
            if (!log.date) return;
            const parts = log.date.split(',')[0].trim().split('/');
            if (parts.length === 3) {
               const logDate = new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
               if (logDate.getTime() === targetDate.getTime()) {
                 count++;
               }
            }
          });
          
          let label = daysLabel[targetDate.getDay()];
          if (numDays > 7 && i !== 0 && targetDate.getDay() !== 1) {
            label = '';
          }
          if (i === 0) label = 'Tdy';
          
          dailyCounts[(numDays - 1) - i] = { label, count };
        }
        
        const maxCount = Math.max(...dailyCounts.map(d => d.count), 1);
        
        dailyCounts.forEach(day => {
          const heightPercent = (day.count / maxCount) * 100;
          const wrapper = document.createElement('div');
          wrapper.className = `bar-wrapper ${wrapperClass}`;
          wrapper.innerHTML = `
            <div class="bar-value">${day.count > 0 ? day.count : ''}</div>
            <div class="bar" style="height: ${Math.max(heightPercent, 2)}%;"></div>
            <div class="bar-label">${day.label}</div>
          `;
          graphContainer.appendChild(wrapper);
        });
      }

      renderGraph('weekly-bar-chart', 7);
      renderGraph('monthly-bar-chart', 30, 'monthly-bar-wrapper');

      const logsContainer = document.getElementById('logs-container');
      logsContainer.innerHTML = '';
      
      if (logs.length === 0) {
        logsContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 11px; text-align: center; margin-top: 10px;">No Naukri applications tracked yet.</p>';
        return;
      }

      logs.slice().reverse().forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `
          <div class="log-item-header">
            <span class="log-item-title" title="${escapeHtml(log.title)}">${escapeHtml(log.title)}</span>
            <span class="log-item-date">${escapeHtml(log.date)}</span>
          </div>
          <div class="log-item-company">${escapeHtml(log.company)}</div>
        `;
        if (log.url) {
          item.style.cursor = 'pointer';
          item.addEventListener('click', () => chrome.tabs.create({ url: log.url }));
        }
        logsContainer.appendChild(item);
      });
    });
  }

  // Export CSV
  document.getElementById('export-csv-btn')?.addEventListener('click', () => {
    chrome.storage.local.get(['appliedJobs'], (result) => {
      const logs = result.appliedJobs || [];
      if (logs.length === 0) {
        showToast('No applications to export!');
        return;
      }

      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Date Applied,Company Name,Job Title,Job Link\r\n";

      logs.forEach(log => {
        const date = `"${log.date || ''}"`;
        const company = `"${(log.company || '').replace(/"/g, '""')}"`;
        const title = `"${(log.title || '').replace(/"/g, '""')}"`;
        const url = `"${log.url || ''}"`;
        csvContent += `${date},${company},${title},${url}\r\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Naukri_SpeedFill_Applications_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  });

  loadProfileData();
  loadLogs();
});
