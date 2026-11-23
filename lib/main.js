// Sender avatars for Mailspring's three-line thread list: colored initials, optionally the
// sender's company logo or Gravatar picture.
//
// Privacy: no network request is made unless the user opts in (see README, "Settings").
// Logos are fetched from the sender's own domain, never through a third-party logo service,
// and never for personal webmail domains.
const crypto = require('crypto');
const { React, ComponentRegistry, Utils } = require('mailspring-exports');

const h = React.createElement;
const ICON_ROLE = 'ThreadListIcon';
const SETTING_LOGOS = 'plugins.avatars.senderLogos';
const SETTING_GRAVATAR = 'plugins.avatars.gravatar';

const setting = (key) => typeof AppEnv !== 'undefined' && AppEnv.config.get(key) === true;
const isMe = (c) => !!(c && typeof c.isMe === 'function' && c.isMe());

function senderOf(thread) {
  const msgs = (thread.__messages || []).filter((m) => m && !m.draft);
  for (let i = msgs.length - 1; i >= 0; i--) {
    const from = msgs[i].from && msgs[i].from[0];
    if (from && !isMe(from)) return from;
  }
  const people = thread.participants || [];
  return people.find((p) => !isMe(p)) || people[0] || null;
}

// Personal mailbox providers: their logo would be wrongly shown as the person's picture.
// Merged with Mailspring's own list (Utils.emailHasCommonDomain), which misses most of these.
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr',
  'live.com', 'live.fr', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'yahoo.com', 'yahoo.fr',
  'ymail.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.fr', 'gmx.de',
  'web.de', 'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru', 'free.fr', 'orange.fr',
  'wanadoo.fr', 'sfr.fr', 'laposte.net', 'bbox.fr', 'neuf.fr', 'tutanota.com', 'fastmail.com',
]);

// Second-level public suffixes that need three labels to name a site (bbc.co.uk).
// ponytail: short list, not the full Public Suffix List; add entries if a country is missing.
const TWO_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp',
  'com.br', 'com.mx', 'co.za', 'com.ar', 'com.tr', 'co.in', 'co.kr', 'com.cn', 'com.sg',
]);

const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function domainOf(email) {
  const at = (email || '').lastIndexOf('@');
  return at < 0 ? '' : email.slice(at + 1).toLowerCase().trim();
}

// Registrable site of the sender's domain, or null when it is not a plain public hostname.
// Rejects anything that could point a request at a path, port, IP address or the local network.
function siteOf(email) {
  const host = domainOf(email);
  if (!HOST_RE.test(host)) return null;
  const labels = host.split('.');
  const tld = labels[labels.length - 1];
  if (/^\d+$/.test(tld) || tld === 'local' || tld === 'localhost' || tld === 'internal') return null;
  const keep = TWO_PART_SUFFIXES.has(labels.slice(-2).join('.')) ? 3 : 2;
  return labels.length < keep ? null : labels.slice(-keep).join('.');
}

function isPersonalDomain(email) {
  return PERSONAL_DOMAINS.has(domainOf(email)) || !!Utils.emailHasCommonDomain(email);
}

// Images that failed or were too small are not requested again during this session.
// ponytail: in memory only, so each launch probes again; persist if that ever matters.
const failed = new Set();

function imageCandidates(contact, { logos = setting(SETTING_LOGOS), gravatar = setting(SETTING_GRAVATAR) } = {}) {
  const email = (contact.email || '').toLowerCase().trim();
  if (!email.includes('@')) return [];
  const urls = [];
  const site = logos && !isPersonalDomain(email) && siteOf(email);
  if (site) {
    urls.push(
      `https://${site}/apple-touch-icon.png`,
      `https://www.${site}/apple-touch-icon.png`,
      `https://www.${site}/favicon.ico`
    );
  }
  if (gravatar) {
    const hash = crypto.createHash('sha256').update(email).digest('hex');
    urls.push(`https://www.gravatar.com/avatar/${hash}?s=96&d=404`);
  }
  return urls.filter((u) => !failed.has(u));
}

function initialsOf(contact) {
  const abbr = typeof contact.nameAbbreviation === 'function' ? contact.nameAbbreviation() : '';
  return abbr || (contact.email || '?').charAt(0).toUpperCase();
}

// Falls back to the next URL when an image fails or is only a tiny favicon.
function tryNext(img) {
  const current = img.getAttribute('src');
  if (current) failed.add(current);
  const urls = JSON.parse(img.dataset.urls || '[]');
  const next = Number(img.dataset.i || 0) + 1;
  if (next < urls.length) {
    img.dataset.i = String(next);
    img.setAttribute('src', urls[next]);
  } else {
    img.removeAttribute('src');
    if (img.parentNode) img.parentNode.classList.remove('has-image');
  }
}

function onImageLoad(event) {
  const img = event.target;
  if (img.naturalWidth < 32) return tryNext(img);
  if (img.parentNode) img.parentNode.classList.add('has-image');
}

// Exposed under a stable name so other plugins (e.g. mailspring-plugin-draft-cards) can reuse it
// through ComponentRegistry.findComponentByName('SenderAvatar').
function SenderAvatar({ thread }) {
  const contact = thread && senderOf(thread);
  if (!contact) return null;
  const urls = imageCandidates(contact);
  const hue = Utils.hueForString(contact.email || '');
  return h(
    'div',
    {
      // Rows are recycled by the virtual list: a new key gives a fresh element, so the
      // `has-image` class set by hand on the previous sender cannot leak to this one.
      key: `${contact.email}|${urls[0] || ''}`,
      className: 'sender-avatar',
      style: { backgroundColor: `hsl(${hue}, 42%, 40%)` },
      'aria-hidden': true,
    },
    h('span', { className: 'sender-avatar-initials' }, initialsOf(contact)),
    urls.length > 0 &&
      h('img', {
        src: urls[0],
        alt: '',
        draggable: false,
        referrerPolicy: 'no-referrer',
        'data-urls': JSON.stringify(urls),
        'data-i': '0',
        onLoad: onImageLoad,
        onError: (e) => tryNext(e.target),
      })
  );
}
SenderAvatar.displayName = 'SenderAvatar';

// ── Activation ───────────────────────────────────────────────────────────
// The three-line thread list shows a single ThreadListIcon component (matchLimit 1) and the
// open-tracking plugin already takes it. Registration order decides, so the avatar goes first
// and the displaced components are registered again right after it. Reads the private
// ComponentRegistry._registry to re-register them exactly as Mailspring did.

let active = false;

function activate() {
  if (active) return;
  active = true;
  const registry = ComponentRegistry._registry || {};
  const displaced = ComponentRegistry.findComponentsMatching({ role: ICON_ROLE })
    .map((component) => registry[component.displayName])
    .filter(Boolean);
  displaced.forEach((entry) => ComponentRegistry.unregister(entry.component));
  ComponentRegistry.register(SenderAvatar, { role: ICON_ROLE });
  displaced.forEach(({ component, roles, locations, modes }) =>
    ComponentRegistry.register(component, { roles, locations, modes })
  );
}

function deactivate() {
  if (!active) return;
  active = false;
  ComponentRegistry.unregister(SenderAvatar);
}

module.exports = {
  activate,
  deactivate,
  serialize() {},
  _test: { senderOf, siteOf, isPersonalDomain, imageCandidates, failed },
};
