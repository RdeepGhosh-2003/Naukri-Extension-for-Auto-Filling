# ⚡ Naukri SpeedFill - Chrome & Brave Auto-Fill Engine

![Naukri SpeedFill Banner](docs/extension_popup_guide.jpg)

**Naukri SpeedFill** is a high-performance Manifest V3 browser extension built for **Chrome** and **Brave**. It automates job applications on **Naukri.com** with sub-10ms local fuzzy field matching, smart location/relocation radio handling, automatic resume selection, CAPTCHA alerts across open tabs, key skills tag matching, and configurable human-like step delay controls.

---

## 🌟 Key Features & Capabilities

### ⚡ 1. Ultra-Fast Sub-10ms Local Matching for Naukri.com
- **Zero API Latency**: Executes instantly using high-speed local fuzzy logic tailored for Naukri's Quick Apply drawers, chatbot screening modals, and multi-step forms.
- **Native React & DOM Binding**: Triggers synthetic `input`, `change`, and `blur` events so React and custom Naukri form state updates immediately.

### 🎯 2. Tailored Naukri Profile Management
- **Current Role**: Stores Designation, Employer/Company, Total Experience, and Current CTC (in INR / Lakhs).
- **Target Role**: Stores Target Job Title, Key Skills, Target Location(s), Expected CTC (in INR / Lakhs), and Notice Period (in Days).

### 📄 3. Auto Resume Selection & Advancement
- Automatically identifies uploaded resume cards on Naukri apply drawers.
- Verifies selection and advances steps without requiring manual clicks.

### 🔔 4. Multi-Tab CAPTCHA Alert System
- Monitors for reCAPTCHA challenges when applying across multiple open tabs.
- **System Browser Notification**: Triggers desktop alert with 1-click tab switching.
- **Tab Title Glow**: Updates document title to `🚨 CAPTCHA REQUIRED - Naukri`.

### 🚀 5. Automatic Application Submission
- Monitored reCAPTCHA checkmark resolution: as soon as verification completes and the submit button enables, SpeedFill automatically clicks **Submit Application** / **Apply**.

### ✋ 6. Interactive Auto-Advance on Manual Fill
- When an unmatched field pauses auto-advance, SpeedFill highlights it with an **amber glowing border** (`speedfill-warning`).
- As soon as you manually pick a radio option or type an answer, SpeedFill automatically clicks `Continue` / `Next` / `Submit` for you!

### 🛑 7. Pause on Missing / Unfilled Data
- Guarantees incomplete applications are never submitted unintentionally.
- If an empty field has no matching data in your dashboard profile or Q&A bank, auto-advance pauses safely, displaying `⚠️ Review Needed`.

### ⏱️ 8. Configurable Human-Like Step Delay Slider
- **Range**: `0 ms` (instant) to `10,000 ms` (10 seconds) in steps of `100 ms`.
- Customize the delay between filling, advancing, or submitting steps to match your desired automation speed.

---

## 🛠️ Step-by-Step Installation Guide

Because **Brave is built on Chromium**, the exact same extension loads natively in both **Brave** and **Chrome**.

```
📁 Project Path: ./Automate Jobs/Naukri/Extension
```

### 1️⃣ Installing in Brave Browser
1. Open **Brave** and navigate to `brave://extensions`.
2. Enable **Developer mode** (toggle in top right corner).
3. Click **Load unpacked**.
4. Select the project folder (`path/to/Automate Jobs/Naukri/Extension`).
5. Pin **Naukri SpeedFill** (📌) to your toolbar.

### 2️⃣ Installing in Chrome Browser
1. Open **Chrome** and navigate to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project folder (`path/to/Automate Jobs/Naukri/Extension`).
5. Pin **Naukri SpeedFill** (📌) to your toolbar.

---

## 🖥️ Extension Dashboard & Configuration

Click the **⚡ SpeedFill icon** on your browser toolbar to open your dashboard window:

| Tab | Purpose & Settings |
| :--- | :--- |
| **💼 Roles** | Edit **Current Role** (Designation, Employer, Experience, Current CTC) and **Target Role** (Target Title, Key Skills, Target Location, Expected CTC, Notice Period Days). |
| **👤 Personal** | Edit Full Name, Contact Details, Email, Phone, Gender, City, and LinkedIn URL. |
| **🎓 Education** | Edit Degree, Specialization/Stream, University, and Graduation Year. |
| **❓ Q&A Bank** | Pre-save custom keyword triggers and answers for employer screening questions and chat popups. |
| **📊 Logs** | Track total applications sent, view 7-day & 30-day visual graphs, and export CSV logs. |
| **⚙️ Settings** | Toggle **Auto-fill On Load**, **Pause on Missing Data**, **Auto-Select Resume**, **Auto-Advance Steps**, **Auto-Submit**, adjust **Step Delay Slider (0–10,000 ms)**, and set **Theme Colors**. |

---

## 📁 Project Architecture & Files

```
Automate Jobs/
└── Naukri/
    └── Extension/
        ├── manifest.json            # Extension Manifest V3 configuration (naukri.com)
        ├── data/
        │   └── default_profile.json # Master user profile JSON data
        ├── popup/
        │   ├── popup.html           # Profile & Dashboard UI HTML layout
        │   ├── popup.css            # Sleek dark/light theme design system
        │   └── popup.js             # Dashboard controller & storage sync
        ├── scripts/
        │   ├── content.js           # Core content script (DOM observer, Naukri drawers, auto-submit)
        │   ├── matcher.js           # Sub-10ms Naukri label & field identifier engine
        │   ├── content.css          # Injected emerald highlight & warning styles
        │   └── background.js        # Service worker (hotkeys & CAPTCHA browser notifications)
        ├── docs/
        │   └── extension_popup_guide.jpg # UI Dashboard Guide diagram
        └── icons/                   # Extension icons (16px, 48px, 128px)
```

---

## ⌨️ Hotkeys

- **Alt + F**: Instant trigger auto-fill on current Naukri form.
