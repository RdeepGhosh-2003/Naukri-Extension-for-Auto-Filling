/**
 * Naukri SpeedFill - Background Service Worker (Manifest V3)
 * Handles Hotkey commands, Browser Notifications, and extension communication
 */

const notificationTabMap = new Map();

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'notify_captcha' && sender.tab) {
    const tabId = sender.tab.id;
    const windowId = sender.tab.windowId;
    const notifId = `captcha_notif_${tabId}_${Date.now()}`;

    notificationTabMap.set(notifId, { tabId, windowId });

    if (chrome.notifications) {
      chrome.notifications.create(notifId, {
        type: 'basic',
        iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAADhJREFUeJztwQENAAAAwqD3T20PBxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwG048AABpWc2swAAAABJRU5ErkJggg==',
        title: '🤖 Naukri SpeedFill - CAPTCHA Required!',
        message: 'A Naukri job application tab requires CAPTCHA verification. Click to switch to this tab.',
        priority: 2,
        requireInteraction: true
      });
    }

    sendResponse({ status: 'notified' });
    return true;
  }

  if (request.action === 'log_application' && request.job) {
    chrome.storage.local.get(['appliedJobs'], (result) => {
      const logs = result.appliedJobs || [];
      logs.push(request.job);
      chrome.storage.local.set({ appliedJobs: logs });
    });
    sendResponse({ status: 'logged' });
    return true;
  }

  if (request.action === 'generate_cover_letter') {
    handleGenerateCoverLetter(request).then(response => {
      sendResponse(response);
    }).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // Keep message channel open for async
  }
});

async function handleGenerateCoverLetter({ jobTitle, company, profile }) {
  const apiKey = profile.settings?.geminiApiKey;
  if (!apiKey) throw new Error('No API Key provided');

  let prompt = `Write a professional cover letter / intro note for the position of "${jobTitle}" at "${company}".\n\n`;
  prompt += `Here are my details to include:\n`;
  
  if (profile.personal?.fullName) prompt += `- Name: ${profile.personal.fullName}\n`;
  if (profile.personal?.phone) prompt += `- Phone: ${profile.personal.phone}\n`;
  if (profile.personal?.email) prompt += `- Email: ${profile.personal.email}\n`;
  
  if (profile.work?.currentRole?.jobTitle) prompt += `- Current Role: ${profile.work.currentRole.jobTitle} at ${profile.work.currentRole.company || 'current company'}\n`;
  if (profile.work?.currentRole?.yearsExperience) prompt += `- Total Experience: ${profile.work.currentRole.yearsExperience} years\n`;
  if (profile.work?.targetRole?.keySkills) prompt += `- Key Skills: ${profile.work.targetRole.keySkills}\n`;
  if (profile.work?.targetRole?.noticePeriod) prompt += `- Notice Period: ${profile.work.targetRole.noticePeriod}\n`;
  
  if (profile.education?.degree) prompt += `- Education: ${profile.education.degree} in ${profile.education.major} from ${profile.education.university}\n`;

  const instructions = profile.personal?.coverLetterInstructions;
  if (instructions) {
    prompt += `\nAdditional Instructions:\n${instructions}\n`;
  } else {
    prompt += `\nKeep it concise, confident, and professional. Do not include placeholder brackets like [Date], just write the core letter bodies so I can paste it directly into a Naukri application box.`;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  const data = await response.json();
  const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!generatedText) throw new Error('No text generated from AI');
  
  return { text: generatedText.trim() };
}

// Handle notification click to switch directly to the CAPTCHA tab
if (chrome.notifications) {
  chrome.notifications.onClicked.addListener((notifId) => {
    const target = notificationTabMap.get(notifId);
    if (target) {
      chrome.tabs.update(target.tabId, { active: true });
      chrome.windows.update(target.windowId, { focused: true });
      chrome.notifications.clear(notifId);
      notificationTabMap.delete(notifId);
    }
  });
}

// Listen for keyboard command triggers (Alt+F)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'fill_form') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'trigger_autofill' }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('[Naukri SpeedFill Background] Message error:', chrome.runtime.lastError.message);
          }
        });
      }
    });
  }
});

// Set default profile on extension installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['userProfile'], (result) => {
    if (!result.userProfile) {
      fetch(chrome.runtime.getURL('data/default_profile.json'))
        .then(res => res.json())
        .then(data => {
          chrome.storage.local.set({ userProfile: data }, () => {
            console.log('[Naukri SpeedFill Background] Default profile initialized.');
          });
        })
        .catch(err => console.error('[Naukri SpeedFill Background] Install init error:', err));
    }
  });
});
