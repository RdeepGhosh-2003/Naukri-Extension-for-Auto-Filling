/**
 * Lightweight DOM Simulator for Naukri Extension Isolation & Search Fill Unit Tests
 * Supports element creation, attributes, DOM hierarchy, dataset, events, and selector matching
 */

if (!global.CSS) {
  global.CSS = {
    escape: function(str) {
      return String(str).replace(/([^\w-])/g, '\\$1');
    }
  };
}

class SimulatedElement {
  constructor(tagName, attrs = {}, textContent = '') {
    this.tagName = tagName.toUpperCase();
    this.attributes = {};
    this.classList = new Set();
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.nextSibling = null;
    this.previousElementSibling = null;
    this.dataset = {};
    this.style = {};
    this.value = attrs.value || '';
    this.disabled = !!attrs.disabled;
    this.readOnly = !!attrs.readOnly;
    this.checked = !!attrs.checked;
    this.offsetWidth = attrs.offsetWidth !== undefined ? attrs.offsetWidth : 100;
    this.offsetHeight = attrs.offsetHeight !== undefined ? attrs.offsetHeight : 30;
    this.listeners = {};

    for (const [key, val] of Object.entries(attrs)) {
      if (key === 'class' || key === 'className') {
        String(val).split(/\s+/).forEach(c => c && this.classList.add(c));
        this.attributes['class'] = val;
      } else if (key.startsWith('data-')) {
        const camelKey = key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        this.dataset[camelKey] = val;
        this.attributes[key] = val;
      } else {
        this.attributes[key] = val;
      }
    }

    this._textContent = textContent;
  }

  get id() { return this.attributes['id'] || ''; }
  set id(val) { this.attributes['id'] = String(val); }

  get name() { return this.attributes['name'] || ''; }
  set name(val) { this.attributes['name'] = String(val); }

  get placeholder() { return this.attributes['placeholder'] || ''; }
  set placeholder(val) { this.attributes['placeholder'] = String(val); }

  get type() { return this.attributes['type'] || 'text'; }
  set type(val) { this.attributes['type'] = String(val); }

  get className() {
    return Array.from(this.classList).join(' ');
  }
  set className(val) {
    this.classList.clear();
    String(val).split(/\s+/).forEach(c => c && this.classList.add(c));
    this.attributes['class'] = String(val);
  }

  get textContent() {
    let text = this._textContent || '';
    for (const child of this.children) {
      const childText = child.textContent;
      if (childText) text += ' ' + childText;
    }
    return text.trim();
  }

  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }

  get options() {
    if (this.tagName !== 'SELECT') return [];
    return this.children.filter(c => c.tagName === 'OPTION');
  }

  get ownerDocument() {
    let current = this.parentElement || this.parentNode;
    while (current) {
      if (current.tagName === 'DOCUMENT') return current;
      current = current.parentElement || current.parentNode;
    }
    return global.document || null;
  }

  getAttribute(attr) {
    return this.attributes[attr] !== undefined ? String(this.attributes[attr]) : null;
  }

  setAttribute(attr, val) {
    const valStr = String(val);
    this.attributes[attr] = valStr;
    if (attr === 'class' || attr === 'className') {
      this.classList.clear();
      valStr.split(/\s+/).forEach(c => c && this.classList.add(c));
    } else if (attr.startsWith('data-')) {
      const camelKey = attr.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[camelKey] = valStr;
    }
  }

  hasAttribute(attr) {
    return this.attributes[attr] !== undefined;
  }

  removeAttribute(attr) {
    delete this.attributes[attr];
    if (attr === 'class') this.classList.clear();
  }

  appendChild(child) {
    if (!child) return child;
    child.parentElement = this;
    child.parentNode = this;
    if (this.children.length > 0) {
      const last = this.children[this.children.length - 1];
      last.nextSibling = child;
      child.previousElementSibling = last;
    }
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
      child.parentNode = null;
    }
    return child;
  }

  insertAdjacentElement(position, element) {
    if (!element) return null;
    if (position === 'afterend') {
      if (this.parentElement) {
        const idx = this.parentElement.children.indexOf(this);
        if (idx !== -1) {
          this.parentElement.children.splice(idx + 1, 0, element);
          element.parentElement = this.parentElement;
          element.parentNode = this.parentElement;
        }
      }
    } else if (position === 'afterbegin') {
      this.children.unshift(element);
      element.parentElement = this;
      element.parentNode = this;
    }
    return element;
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(l => l !== listener);
    }
  }

  dispatchEvent(event) {
    const type = typeof event === 'string' ? event : event.type;
    const evt = typeof event === 'string' ? { type, target: this, bubbles: true } : event;
    if (!evt.target) evt.target = this;

    if (this.listeners[type]) {
      this.listeners[type].forEach(fn => fn(evt));
    }
    if (evt.bubbles && this.parentElement) {
      this.parentElement.dispatchEvent(evt);
    }
    return true;
  }

  click() {
    if (this.type === 'radio') {
      this.checked = true;
    }
    this.dispatchEvent('click');
  }

  matches(selector) {
    if (!selector) return false;
    let sel = selector.trim();

    // Comma-separated list of selectors
    if (sel.includes(',')) {
      return sel.split(',').some(sub => this.matches(sub));
    }

    // Strip case-insensitivity flag ' i]' -> ']' from attribute selectors
    sel = sel.replace(/\s+i\]/gi, ']');

    // Extract tag name if present at start
    let remaining = sel;
    const tagMatch = remaining.match(/^([a-zA-Z0-9]+)/);
    if (tagMatch) {
      const tag = tagMatch[1];
      if (this.tagName !== tag.toUpperCase()) return false;
      remaining = remaining.slice(tag.length);
    }

    // Process remaining tokens: #id, .class, [attr=val]
    while (remaining.length > 0) {
      if (remaining.startsWith('#')) {
        const idMatch = remaining.match(/^#([a-zA-Z0-9_-]+)/);
        if (!idMatch) return false;
        if (this.id !== idMatch[1]) return false;
        remaining = remaining.slice(idMatch[0].length);
      } else if (remaining.startsWith('.')) {
        const classMatch = remaining.match(/^\.([a-zA-Z0-9_-]+)/);
        if (!classMatch) return false;
        if (!this.classList.has(classMatch[1])) return false;
        remaining = remaining.slice(classMatch[0].length);
      } else if (remaining.startsWith('[')) {
        const attrMatch = remaining.match(/^\[([a-zA-Z0-9_-]+)(?:([\*\^$=])["']?([^"'\]]*)["']?)?\]/);
        if (!attrMatch) return false;
        const [, attr, op, val] = attrMatch;
        if (!this.hasAttribute(attr)) return false;
        if (op) {
          const actualVal = (this.getAttribute(attr) || '').toLowerCase();
          const targetVal = (val || '').toLowerCase();
          if (op === '=' && actualVal !== targetVal) return false;
          if (op === '*=' && !actualVal.includes(targetVal)) return false;
          if (op === '^=' && !actualVal.startsWith(targetVal)) return false;
          if (op === '$=' && !actualVal.endsWith(targetVal)) return false;
        }
        remaining = remaining.slice(attrMatch[0].length);
      } else {
        return false;
      }
    }

    return true;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches && current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    const results = this.querySelectorAll(selector);
    return results.length > 0 ? results[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const traverse = (node) => {
      for (const child of node.children) {
        if (child.matches && child.matches(selector)) {
          results.push(child);
        }
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }
}

class SimulatedDocument extends SimulatedElement {
  constructor() {
    super('DOCUMENT');
    this.title = 'Naukri.com - Jobs in India';
    this.body = new SimulatedElement('BODY');
    this.appendChild(this.body);
  }

  createElement(tagName) {
    return new SimulatedElement(tagName);
  }

  getElementById(id) {
    const results = this.querySelectorAll(`#${id}`);
    return results.length > 0 ? results[0] : null;
  }
}

function createDOM() {
  const doc = new SimulatedDocument();
  global.document = doc;
  
  const EventClass = function(type, opts = {}) {
    this.type = type;
    this.bubbles = opts.bubbles !== undefined ? opts.bubbles : true;
    this.cancelable = opts.cancelable !== undefined ? opts.cancelable : true;
  };

  global.Event = EventClass;
  global.HTMLInputElement = { prototype: {} };
  global.HTMLTextAreaElement = { prototype: {} };

  global.window = {
    document: doc,
    location: { hostname: 'www.naukri.com', href: 'https://www.naukri.com' },
    Event: EventClass,
    HTMLInputElement: global.HTMLInputElement,
    HTMLTextAreaElement: global.HTMLTextAreaElement,
    CSS: global.CSS,
    getComputedStyle: function(el) {
      return el ? (el.style || {}) : {};
    }
  };

  return doc;
}

module.exports = {
  SimulatedElement,
  SimulatedDocument,
  createDOM
};
