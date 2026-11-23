# Sender Avatars for Mailspring

Round sender avatars in [Mailspring](https://getmailspring.com)'s three-line thread list, so you recognise who wrote before reading a word.

- **Colored initials** for every sender, computed locally.
- **Company logos** (opt-in), fetched from the sender's own website.
- **Gravatar pictures** (opt-in).

Works with any theme. Looks best with **[mailspring-theme-graphite](https://github.com/jblavisse/mailspring-theme-graphite)**.

## Privacy and settings

By default the plugin makes **no network request**.

| Setting | What it does | What leaves your machine |
|---|---|---|
| `plugins.avatars.senderLogos` | Shows the sender's company logo from the sender's own website (`apple-touch-icon.png`, then `favicon.ico`). Never used for personal webmail domains (Gmail, Outlook, iCloud, Proton, Free, Orange, La Poste…). | The sender's web server sees your IP address and when your list displayed their message, even for mail you never open. No third-party logo service is involved. |
| `plugins.avatars.gravatar` | Shows the sender's [Gravatar](https://gravatar.com) picture when one exists. | Gravatar receives a SHA-256 hash of each sender's address, as Mailspring's own contact card already does. |

Failed or tiny images are not requested again during the session. Sender domains are validated, so an email address cannot point a request at a path, a port, an IP address or your local network.

**Turn a setting on:** quit Mailspring, then add it under the top-level `"*"` key of `config.json` (macOS: `~/Library/Application Support/Mailspring/config.json`):

```json
"plugins": {
  "avatars": { "senderLogos": true, "gravatar": true }
}
```

Or, without quitting: **Developer → Toggle Developer Tools → Console**, then run `AppEnv.config.set('plugins.avatars.senderLogos', true)`.

## Install

**From a ZIP**

1. Download this repository (Code → Download ZIP) and unzip it.
2. In Mailspring: **Developer → Install a Plugin…**, then pick the unzipped folder.
3. Restart Mailspring.

**From Git (to follow updates)**

```bash
git clone https://github.com/jblavisse/mailspring-plugin-avatars.git
ln -s "$PWD/mailspring-plugin-avatars" "$HOME/Library/Application Support/Mailspring/packages/mailspring-plugin-avatars"
```

On Linux, the packages folder is `~/.config/Mailspring/packages`. Restart Mailspring.

## How it works

- The avatar takes the `ThreadListIcon` slot of the three-line thread list. That slot shows a single component, so the open-tracking status icon no longer appears in that layout. It still appears in the message header.
- The unread dot (or the star on hover) sits left of the avatar, both centred on the card.
- The avatar is registered as `SenderAvatar`, so other plugins can reuse it: [mailspring-plugin-draft-cards](https://github.com/jblavisse/mailspring-plugin-draft-cards) shows it on draft cards.

## Related plugins

- [mailspring-plugin-list-header](https://github.com/jblavisse/mailspring-plugin-list-header): folder name and a compose button above the list.
- [mailspring-plugin-draft-cards](https://github.com/jblavisse/mailspring-plugin-draft-cards): the Drafts folder as inbox-style cards.

## Compatibility

Mailspring **1.26** or later. Reads Mailspring's private `ComponentRegistry._registry` to keep the open-tracking icon registered; a future release may need an update.

## Development

```bash
npm test
```

Covers domain validation, personal-domain detection, opt-in settings, the failed-image cache and sender selection.

## License

[GPL-3.0-or-later](LICENSE), the same license as Mailspring.
