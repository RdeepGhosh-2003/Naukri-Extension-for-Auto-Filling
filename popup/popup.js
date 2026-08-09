/**
 * Naukri SpeedFill - Popup Controller (Quick Search Only)
 */

document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('save-btn');
  const addSearchBtn = document.getElementById('add-search-btn');
  const searchesContainer = document.getElementById('saved-searches-container');
  const toast = document.getElementById('toast');

  let userProfileData = {};

  // Add New Search button
  addSearchBtn?.addEventListener('click', () => {
    appendSearchBlock({});
  });

  // Save Configuration button
  saveBtn?.addEventListener('click', () => {
    const searchBlocks = document.querySelectorAll('#saved-searches-container .search-block');
    const savedSearches = Array.from(searchBlocks)
      .map(block => ({
        role:       block.querySelector('.ss-role')?.value.trim()       || '',
        location:   block.querySelector('.ss-location')?.value.trim()   || '',
        experience: block.querySelector('.ss-experience')?.value.trim() || ''
      }))
      .filter(s => s.role || s.location || s.experience);

    userProfileData.savedSearches = savedSearches;

    chrome.storage.local.set({ userProfile: userProfileData }, () => {
      showToast('Configuration Saved Successfully!');
    });
  });

  // Load savedSearches from chrome.storage.local
  function loadSavedSearches() {
    chrome.storage.local.get(['userProfile'], (result) => {
      if (result && result.userProfile) {
        userProfileData = result.userProfile;
        renderSearchBlocks(Array.isArray(userProfileData.savedSearches) ? userProfileData.savedSearches : []);
      } else {
        fetch(chrome.runtime.getURL('data/default_profile.json'))
          .then(res => res.json())
          .then(data => {
            userProfileData = data;
            chrome.storage.local.set({ userProfile: data }, () => {
              renderSearchBlocks(Array.isArray(data.savedSearches) ? data.savedSearches : []);
            });
          })
          .catch(() => {
            renderSearchBlocks([]);
          });
      }
    });
  }

  /**
   * Render all search-block cards from an array of { role, location, experience } objects.
   */
  function renderSearchBlocks(searches) {
    if (!searchesContainer) return;
    searchesContainer.innerHTML = '';
    const list = searches.length > 0 ? searches : [{}]; // always at least 1 empty block
    list.forEach(item => appendSearchBlock(item));
  }

  /**
   * Append a single styled search-block card to #saved-searches-container.
   */
  function appendSearchBlock(item = {}) {
    if (!searchesContainer) return;

    const block = document.createElement('div');
    block.className = 'search-block';
    block.style.cssText = [
      'margin-bottom:10px',
      'padding:14px 16px',
      'background:var(--bg-input, rgba(15,23,42,0.6))',
      'border:1px solid rgba(56,189,248,0.25)',
      'border-radius:var(--radius-sm, 8px)',
      'position:relative'
    ].join(';');

    const blockNum = searchesContainer.querySelectorAll('.search-block').length + 1;

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
      <div class="form-group" style="margin-bottom:10px;">
        <label style="display:block;font-size:11px;margin-bottom:4px;color:var(--text-muted, #94a3b8);">Target Job Title / Role</label>
        <input type="text" class="ss-role"
          value="${escapeHtml(item.role || '')}"
          placeholder="e.g. Data Analyst"
          style="width:100%;box-sizing:border-box;padding:8px 10px;font-size:12px;border-radius:6px;border:1px solid var(--border-color, rgba(255,255,255,0.15));background:var(--bg-card, #1e293b);color:var(--text-main, #f8fafc);">
      </div>
      <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-group">
          <label style="display:block;font-size:11px;margin-bottom:4px;color:var(--text-muted, #94a3b8);">Location</label>
          <input type="text" class="ss-location"
            value="${escapeHtml(item.location || '')}"
            placeholder="e.g. Bengaluru"
            style="width:100%;box-sizing:border-box;padding:8px 10px;font-size:12px;border-radius:6px;border:1px solid var(--border-color, rgba(255,255,255,0.15));background:var(--bg-card, #1e293b);color:var(--text-main, #f8fafc);">
        </div>
        <div class="form-group">
          <label style="display:block;font-size:11px;margin-bottom:4px;color:var(--text-muted, #94a3b8);">Experience (Yrs)</label>
          <input type="text" class="ss-experience"
            value="${escapeHtml(item.experience || '')}"
            placeholder="e.g. 2"
            style="width:100%;box-sizing:border-box;padding:8px 10px;font-size:12px;border-radius:6px;border:1px solid var(--border-color, rgba(255,255,255,0.15));background:var(--bg-card, #1e293b);color:var(--text-main, #f8fafc);">
        </div>
      </div>
    `;

    // Delete button logic
    block.querySelector('.delete-search-btn').addEventListener('click', () => {
      block.remove();
      searchesContainer.querySelectorAll('.search-block').forEach((b, i) => {
        const lbl = b.querySelector('.search-block-label');
        if (lbl) lbl.textContent = `🔍 Search #${i + 1}`;
      });
    });

    searchesContainer.appendChild(block);
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;');
  }

  loadSavedSearches();
});
