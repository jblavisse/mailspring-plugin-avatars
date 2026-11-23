# Graphite plugin for Mailspring

Three additions to [Mailspring](https://getmailspring.com) that make the message list easier to scan:

- **Sender avatars** in the thread list: colored initials by default, optionally the sender's company logo or Gravatar picture.
- **A list header** above the thread list and the drafts list: folder name, account, and a compose button.
- **Drafts as cards**: the Drafts folder uses the same three-line cards as the inbox (avatar, recipients, subject, preview, date), with "Me" for your own address.

Designed with **[mailspring-theme-graphite](https://github.com/jblavisse/mailspring-theme-graphite)**, and works with other themes.

## Privacy and settings

By default the plugin makes **no network request**: avatars are colored initials computed locally.

Two settings turn on remote pictures. Both are off by default.

| Setting | What it does | What leaves your machine |
|---|---|---|
| `plugins.graphite.senderLogos` | Shows the sender's company logo, fetched from the sender's own website (`apple-touch-icon.png`, then `favicon.ico`). Never used for personal webmail domains (Gmail, Outlook, iCloud, Proton, Free, Orange, La Poste…). | The sender's web server sees your IP address and when your list displayed their message, even for mail you never open. No third-party logo service is involved. |
| `plugins.graphite.gravatar` | Shows the sender's [Gravatar](https://gravatar.com) picture when one exists. | Gravatar receives a SHA-256 hash of each sender's address, the same way Mailspring's own contact card already queries Gravatar. |

Failed or tiny images are not requested again during the session. Sender domains are validated, so an email address cannot point a request at a path, a port, an IP address or your local network.

**Turn a setting on:** quit Mailspring, then add it under the top-level `"*"` key of `config.json` (macOS: `~/Library/Application Support/Mailspring/config.json`):

```json
"plugins": {
  "graphite": { "senderLogos": true, "gravatar": true }
}
```

Or, without quitting: **Developer → Toggle Developer Tools → Console**, then run `AppEnv.config.set('plugins.graphite.senderLogos', true)`.

## Install

**From a ZIP**

1. Download this repository (Code → Download ZIP) and unzip it.
2. In Mailspring: **Developer → Install a Plugin…**, then pick the unzipped folder.
3. Restart Mailspring.

**From Git (to follow updates)**

```bash
git clone https://github.com/jblavisse/mailspring-plugin-graphite.git
```

Link it into Mailspring's packages folder (macOS path shown; on Linux use `~/.config/Mailspring/packages`):

```bash
ln -s "$PWD/mailspring-plugin-graphite" "$HOME/Library/Application Support/Mailspring/packages/mailspring-plugin-graphite"
```

Restart Mailspring.

## How it works

- **Avatars** take the `ThreadListIcon` slot of the three-line thread list. That slot shows a single component, so the open-tracking status icon no longer appears in that layout. It still appears in the message header and in the wide list.
- **Drafts** keep Mailspring's own `DraftList` component (selection, double-click to edit, delete). The plugin swaps the 39px list it renders for 78px cards that reuse the inbox classes.
- The header uses Mailspring's translations (`localized()`); folder names and labels follow your interface language.
- Deactivating the plugin restores Mailspring's components as they were registered.

## Compatibility

- Mailspring **1.26** or later.
- Reads Mailspring's private `ComponentRegistry._registry` to restore built-in components exactly. If a Mailspring release changes it, the plugin falls back to the stock drafts layout and logs `[graphite]` in the console.

## Development

```bash
npm test
```

Runs `test/self-check.js` with Node. It mocks the few Mailspring APIs involved and covers domain validation, personal-domain detection, opt-in settings, sender selection, name cleanup, dates and the drafts-list swap.

## License

[GPL-3.0-or-later](LICENSE), the same license as Mailspring.
