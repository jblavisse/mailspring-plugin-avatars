// Self-check outside Mailspring: `npm test` (or `node test/self-check.js`).
// Mocks the few Mailspring APIs the pure helpers touch.
const Module = require('module');
const assert = require('assert');

const config = {};
global.AppEnv = { config: { get: (k) => config[k] } };
const load = Module._load;
Module._load = (req, ...rest) =>
  req === 'mailspring-exports'
    ? {
        React: {
          createElement: () => null,
          Component: class {},
          cloneElement: (el, props, children) => ({
            ...el,
            props: { ...el.props, ...props, ...(children !== undefined ? { children } : {}) },
          }),
        },
        ComponentRegistry: {},
        // Mailspring's real list (utils.ts) lacks outlook.com, icloud.com, free.fr...: keep it short here
        // so the plugin's own list is what the test exercises.
        Utils: { emailHasCommonDomain: (e) => e.endsWith('@gmail.com') },
        localized: (s) => s,
      }
    : load(req, ...rest);

const { senderOf, siteOf, isPersonalDomain, imageCandidates, withCards, draftDate, shortName, failed } =
  require('../lib/main')._test;

// siteOf: registrable site, and nothing that could aim a request elsewhere.
assert.strictEqual(siteOf('n@mail.example.org'), 'example.org');
assert.strictEqual(siteOf('x@news.bbc.co.uk'), 'bbc.co.uk');
assert.strictEqual(siteOf('x@news.ups.com'), 'ups.com');
assert.strictEqual(siteOf('x@mail.ovh.net'), 'ovh.net');
assert.strictEqual(siteOf('x@a.b/c.d'), null, 'path in domain');
assert.strictEqual(siteOf('x@host:8080'), null, 'port');
assert.strictEqual(siteOf('x@192.168.1.10'), null, 'IP address');
assert.strictEqual(siteOf('x@printer.local'), null, 'local network');
assert.strictEqual(siteOf('x@localhost'), null);
assert.strictEqual(siteOf('"a@evil.com"@victim.com'), 'victim.com', 'last @ wins');
assert.strictEqual(siteOf('broken'), null);

// Personal webmail never gets a logo, including domains Mailspring's own list misses.
for (const d of ['outlook.com', 'icloud.com', 'proton.me', 'free.fr', 'orange.fr', 'laposte.net', 'gmail.com']) {
  assert.ok(isPersonalDomain(`someone@${d}`), d);
}
assert.ok(!isPersonalDomain('hello@example.org'));

// Network sources are opt-in.
assert.deepStrictEqual(imageCandidates({ email: 'hello@example.org' }), [], 'nothing by default');
const both = imageCandidates({ email: 'Hello@Mail.Example.org' }, { logos: true, gravatar: true });
assert.strictEqual(both[0], 'https://example.org/apple-touch-icon.png');
assert.ok(both[3].startsWith('https://www.gravatar.com/avatar/'));
assert.strictEqual(imageCandidates({ email: 'ami@outlook.com' }, { logos: true, gravatar: false }).length, 0);
config['plugins.graphite.senderLogos'] = true;
assert.strictEqual(imageCandidates({ email: 'hello@example.org' }).length, 3, 'setting read');
failed.add('https://example.org/apple-touch-icon.png');
assert.strictEqual(imageCandidates({ email: 'hello@example.org' })[0], 'https://www.example.org/apple-touch-icon.png');
assert.deepStrictEqual(imageCandidates({ email: '' }, { logos: true, gravatar: true }), []);

// Sender: last non-draft message not from me, then participants.
const me = { email: 'me@x.fr', isMe: () => true };
const ann = { email: 'ann@x.fr', isMe: () => false };
const bob = { email: 'bob@x.fr', isMe: () => false };
assert.strictEqual(senderOf({ __messages: [{ from: [ann] }, { from: [me] }] }), ann);
assert.strictEqual(senderOf({ __messages: [{ from: [bob], draft: true }], participants: [me, ann] }), ann);
assert.strictEqual(senderOf({ participants: [] }), null);

// Names.
assert.strictEqual(shortName({ name: 'Ada Lovelace <ada@x.co>', email: 'ada@x.co' }), 'Ada Lovelace');
assert.strictEqual(shortName({ name: '"Ada Lovelace <ada@x.co>"', email: 'ada@x.co' }), 'Ada Lovelace');
assert.strictEqual(shortName({ name: '', email: 'a@b.fr' }), 'a@b.fr');
assert.strictEqual(shortName({ name: 'x', email: 'me@x.fr', isMe: () => true }), 'Me');

// Dates.
assert.strictEqual(draftDate(null), '');
assert.strictEqual(draftDate('not a date'), '');
const now = new Date(2026, 10, 23, 18, 0);
assert.match(draftDate(new Date(2026, 10, 23, 9, 5), now), /09.05|9.05/);
assert.notStrictEqual(draftDate(new Date(2026, 3, 2), now), '');

// The 39px DraftList list is replaced deep in the tree; the rest is kept.
const list = { type: 'List', props: { itemHeight: 39, className: 'draft-list' } };
const tree = { type: 'Flux', props: { children: { type: 'Focus', props: { children: list } } } };
const out = withCards(tree, ['COLS']);
const patched = out.props.children.props.children;
assert.strictEqual(patched.props.itemHeight, 78);
assert.deepStrictEqual(patched.props.columns, ['COLS']);
assert.strictEqual(out.type, 'Flux');
assert.strictEqual(withCards({ type: 'X', props: { itemHeight: 40 } }, []).props.itemHeight, 40, 'unknown layout untouched');

console.log('graphite self-check: ok');
