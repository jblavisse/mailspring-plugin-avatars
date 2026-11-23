// Graphite for Mailspring
//  - sender avatar in the thread list: colored initials, optionally the sender's site logo or Gravatar;
//  - list header ("Inbox" + account) with a compose button above the thread list and the drafts list;
//  - drafts rendered as the same three-line cards as the inbox.
//
// Privacy: no network request is made unless the user opts in (see README, "Settings").
// Logos are fetched from the sender's own domain, never through a third-party logo service,
// and never for personal webmail domains.
const crypto = require('crypto');
const {
  React,
  ComponentRegistry,
  WorkspaceStore,
  FocusedPerspectiveStore,
  AccountStore,
  Actions,
  Utils,
  localized,
} = require('mailspring-exports');

const h = React.createElement;
const ICON_ROLE = 'ThreadListIcon';
const SETTING_LOGOS = 'plugins.graphite.senderLogos';
const SETTING_GRAVATAR = 'plugins.graphite.gravatar';

const setting = (key) => typeof AppEnv !== 'undefined' && AppEnv.config.get(key) === true;
const isMe = (c) => !!(c && typeof c.isMe === 'function' && c.isMe());

function uiIsFrench() {
  const chosen = typeof AppEnv !== 'undefined' ? AppEnv.config.get('core.intl.language') : '';
  const lang = chosen || (typeof navigator !== 'undefined' ? navigator.language : '') || '';
  return /^fr/i.test(lang);
}

// Mailspring has no translation for "Me".
const meLabel = () => (uiIsFrench() ? 'Moi' : localized('Me'));

// ── Sender avatar ────────────────────────────────────────────────────────

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

function GraphiteAvatar({ thread }) {
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
      className: 'graphite-avatar',
      style: { backgroundColor: `hsl(${hue}, 42%, 40%)` },
      'aria-hidden': true,
    },
    h('span', { className: 'graphite-avatar-initials' }, initialsOf(contact)),
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
GraphiteAvatar.displayName = 'GraphiteAvatar';

// ── List header ──────────────────────────────────────────────────────────

function headerState() {
  const p = FocusedPerspectiveStore.current();
  const ids = (p && p.accountIds) || [];
  const account = ids.length === 1 ? AccountStore.accountForId(ids[0]) : null;
  return {
    title: localized((p && p.name) || ''),
    subtitle: account ? account.emailAddress : ids.length > 1 ? localized('All Accounts') : '',
  };
}

const PENCIL = h(
  'svg',
  {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  },
  h('path', { d: 'M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4z' }),
  h('path', { d: 'M13.5 6.5l4 4' })
);

class GraphiteListHeader extends React.Component {
  constructor(props) {
    super(props);
    this.state = headerState();
  }
  componentDidMount() {
    this.unlisten = FocusedPerspectiveStore.listen(() => this.setState(headerState()));
  }
  componentWillUnmount() {
    if (this.unlisten) this.unlisten();
  }
  render() {
    return h(
      'header',
      { className: 'graphite-list-header' },
      h(
        'div',
        { className: 'graphite-list-titles' },
        h('h1', null, this.state.title),
        this.state.subtitle && h('div', { className: 'graphite-list-subtitle' }, this.state.subtitle)
      ),
      h(
        'button',
        {
          className: 'graphite-icon-button',
          title: localized('Compose new message'),
          'aria-label': localized('Compose new message'),
          onClick: () => Actions.composeNewBlankDraft(),
        },
        PENCIL
      )
    );
  }
}
GraphiteListHeader.displayName = 'GraphiteListHeader';

// ── Drafts as cards ──────────────────────────────────────────────────────
// Mailspring renders drafts with its own DraftList (39px rows, wide columns). We keep its
// behavior (selection, double-click, delete) and only swap the list it renders for 78px cards
// that reuse the inbox classes.

function draftSnippet(html) {
  if (!html || typeof html !== 'string') return '';
  try {
    // Parse a generous slice: Utils truncates the HTML before parsing, so a long <head>
    // or <style> would otherwise leave nothing to show.
    return Utils.extractTextFromHtml(html, { maxLength: 4000 }).substr(0, 200);
  } catch (err) {
    return '';
  }
}

function draftDate(date, now = new Date()) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d)) return '';
  const use24 = typeof AppEnv !== 'undefined' && AppEnv.config.get('core.workspace.use24HourClock');
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: !use24 })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Short name as in the inbox: "Me" for yourself, otherwise the name without its address.
function shortName(contact) {
  if (isMe(contact)) return meLabel();
  // Some drafts store "Name <address>" (sometimes quoted) in the name field.
  const name = (contact.name || '').replace(/["']/g, '').replace(/\s*<[^>]*>/g, '').trim();
  return name && name.toLowerCase() !== (contact.email || '').toLowerCase() ? name : contact.email;
}

function draftColumns() {
  const { ListTabular, InjectedComponentSet } = require('mailspring-component-kit');
  return [
    new ListTabular.Column({
      name: 'Item',
      flex: 1,
      resolver: (draft) => {
        const people = [...(draft.to || []), ...(draft.cc || []), ...(draft.bcc || [])];
        const subject = (draft.subject || '').trim();
        return h(
          'div',
          { className: 'graphite-draft-row' },
          h(
            'div',
            { className: 'icons-column' },
            h('div', { className: 'thread-icon' }),
            people.length
              ? h(GraphiteAvatar, { thread: { participants: people } })
              : h('div', { className: 'graphite-avatar graphite-avatar-empty', 'aria-hidden': true })
          ),
          h(
            'div',
            { className: 'thread-info-column' },
            h(
              'div',
              { className: 'participants-wrapper' },
              h(
                'div',
                { className: 'participants' + (people.length ? '' : ' no-recipients') },
                people.length ? people.map(shortName).join(', ') : localized('(No Recipients)')
              ),
              h('span', { style: { flex: 1 } }),
              h(InjectedComponentSet, {
                inline: true,
                containersRequired: false,
                matching: { role: 'DraftList:DraftStatus' },
                className: 'draft-list-injected-state',
                exposedProps: { draft },
              }),
              h('span', { className: 'timestamp' }, draftDate(draft.date))
            ),
            h('div', { className: 'subject' + (subject ? '' : ' no-subject') }, subject || localized('(No Subject)')),
            h(
              'div',
              { className: 'snippet-and-labels' },
              h('div', { className: 'snippet' }, draftSnippet(draft.body) || ' ')
            )
          )
        );
      },
    }),
  ];
}

const STOCK_DRAFT_ROW_HEIGHT = 39;

// Replaces, deep in the tree DraftList renders, the 39px list with the card version.
function withCards(element, columns) {
  if (!element || !element.props) return element;
  if (element.props.itemHeight === STOCK_DRAFT_ROW_HEIGHT) {
    return React.cloneElement(element, {
      itemHeight: 78,
      columns,
      className: 'draft-list thread-list thread-list-narrow graphite-draft-list',
    });
  }
  const { children } = element.props;
  if (!children) return element;
  return React.cloneElement(
    element,
    {},
    Array.isArray(children) ? children.map((c) => withCards(c, columns)) : withCards(children, columns)
  );
}

// ── Activation ───────────────────────────────────────────────────────────
// Uses ComponentRegistry._registry (private) to read how built-in components were registered,
// so they can be restored exactly on deactivate. Everything degrades to stock Mailspring if absent.

let active = false;
let displacedIcons = [];
let draftEntry = null;
let GraphiteDraftList = null;

function registeredEntry(name) {
  const registry = ComponentRegistry._registry || {};
  return registry[name] || null;
}

function reRegister({ component, roles, locations, modes }) {
  ComponentRegistry.register(component, { roles, locations, modes });
}

function replaceDraftList() {
  draftEntry = registeredEntry('DraftList');
  if (!draftEntry) {
    console.warn('[graphite] DraftList not registered yet: drafts keep the stock layout.');
    return;
  }
  const columns = draftColumns();
  GraphiteDraftList = class extends draftEntry.component {
    render() {
      return withCards(super.render(), columns);
    }
  };
  GraphiteDraftList.displayName = 'GraphiteDraftList';
  ComponentRegistry.unregister(draftEntry.component);
  reRegister({ ...draftEntry, component: GraphiteDraftList });
}

function activate() {
  if (active) return;
  active = true;

  // The narrow thread list shows a single ThreadListIcon component (matchLimit 1) and the
  // open-tracking plugin already takes it. Registration order decides, so the avatar goes
  // first and the displaced components are registered again right after it.
  displacedIcons = ComponentRegistry.findComponentsMatching({ role: ICON_ROLE })
    .map((component) => registeredEntry(component.displayName))
    .filter(Boolean);
  displacedIcons.forEach((entry) => ComponentRegistry.unregister(entry.component));
  ComponentRegistry.register(GraphiteAvatar, { role: ICON_ROLE });
  displacedIcons.forEach(reRegister);

  ComponentRegistry.register(GraphiteListHeader, {
    locations: [WorkspaceStore.Location.ThreadList, WorkspaceStore.Location.DraftList],
    modes: ['split', 'list'],
  });
  replaceDraftList();
}

function deactivate() {
  if (!active) return;
  active = false;
  ComponentRegistry.unregister(GraphiteAvatar);
  ComponentRegistry.unregister(GraphiteListHeader);
  if (draftEntry && GraphiteDraftList) {
    ComponentRegistry.unregister(GraphiteDraftList);
    reRegister(draftEntry);
  }
  draftEntry = null;
  GraphiteDraftList = null;
  displacedIcons = [];
}

module.exports = {
  activate,
  deactivate,
  serialize() {},
  _test: { senderOf, siteOf, isPersonalDomain, imageCandidates, withCards, draftDate, shortName, failed },
};
