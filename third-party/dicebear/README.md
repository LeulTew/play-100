# DiceBear / Critters

Play 100 generates avatars locally with **`@dicebear/core` 10.7.0** (MIT)
and only **`@dicebear/styles/critters.json` from `@dicebear/styles` 10.6.0**
(Critters by DiceBear, CC0 1.0). These are exact pins, not version ranges.
Other DiceBear styles have their own, sometimes different, licenses.

| Material | Source | License |
| --- | --- | --- |
| JavaScript core 10.7.0 | https://www.npmjs.com/package/@dicebear/core/v/10.7.0 ; https://github.com/dicebear/dicebear | MIT; complete shipped notice in `core-LICENSE.txt` |
| Critters definition, styles 10.6.0 | https://www.npmjs.com/package/@dicebear/styles/v/10.6.0 ; https://www.dicebear.com/styles/critters/ | https://creativecommons.org/publicdomain/zero/1.0/ |
| Critters creator/source | DiceBear, https://www.dicebear.com | CC0 legal text: https://creativecommons.org/publicdomain/zero/1.0/legalcode.en |

The installed style export resolves to `dist/critters.min.json` (53,270 bytes),
schema 1.4.0. Its SHA-256 is
`df67e34f221589c4949d989996008158d6cdfdcd4149ff92297c51077ca59e9e`.
The npm tarball integrity is recorded in `package-lock.json`. No definition
from GitHub's moving main branch or remote avatar API is used.

The style's original `meta` block is retained in `critters-meta.json`, and its
creator/source/license metadata remains embedded in every generated SVG.
MIT permission applies to the core, not automatically to every avatar style.
The distribution notice is also served from `public\licenses\dicebear.txt`.

## Play 100 version 1 recipe

`src\lib\avatar.ts` defines the complete recipe: round/squat/dome/blob bodies;
round/drooping/pointed ears or a nub; round/wide/happy/big-pupil eyes;
smile/cat-mouth/grin mouths. Top, body, eyes and mouth are always present.
Belly/spot markings have 25% probability; blush cheeks have 15% probability.
The original small highlights/shadows and grin/blush details remain part of
the licensed vector artwork; no gradients, new effects or animation are added.

| Palette | Body | Accent |
| --- | --- | --- |
| Lime | `#d3f36b` | `#b6ce68` |
| Moss | `#8fa38f` | `#6f856f` |
| Clay | `#d9bd94` | `#a8865a` |
| Sky | `#a9bfd7` | `#879fb8` |
| Lilac | `#b5a6c4` | `#9383a9` |

All use ink `#20231e`, chalk `#f3f3e9` and solid color fills.
`animationVariant: 'none'`, `animationProbability: 0` and no animation tag
make this recipe static. `idRandomization: false` keeps output byte-stable.
SVG IDs must remain isolated inside `img` data URIs, not injected inline.

**Version 1 is a saved appearance contract.** Dependency versions, style file,
variant order, probabilities, transforms and colors must not change under
version 1. Before a future library/style update, preserve the v1 renderer and
introduce an explicit new descriptor version; never rerandomize saved seeds.
Focused golden-hash tests guard this contract.

Descriptors contain only `{ version: 1, seed, palette }`, with 32 lowercase
hex characters generated from 16 cryptographically random bytes. They are
decorative, not authentication identities. Names, email addresses and account
IDs are never seeds. Generation uses a shared validated Style and a bounded
256-entry descriptor-keyed cache; candidate generation makes at most 60 draws,
preferring distinct appearances and falling back to distinct seeds if needed.

`parseAvatarDescriptor` validates an already-decoded object and returns a copy;
it throws rather than repairing invalid metadata. `isAvatarDescriptor` and
`isAvatarPalette` are guards. `createAvatarDescriptor`, `createAvatarCandidates`,
`generateAvatarSvg` and `generateAvatarDataUri` expose the local codec.

`Avatar` accepts `descriptor`, `size` (48 by default), `className` and `label`.
An empty label is decorative beside a username. `AvatarPicker` accepts `value`,
`identityKey`, `onSave`, `onCancel` and optional `titleId` to connect its heading
to the owner's existing Dialog. Importing either component includes its scoped
CSS; the picker inherits the app's fonts, tokens and button classes.

The picker owns only a draft. Ordinary external value changes never replace an
open draft. Identity changes remount it and discard stale completion/error UI.
Save receives a descriptor snapshot, is single-flight, and preserves the draft
on failure. Successful save does not call Cancel or close the owner's dialog.
If secure randomness fails, the current valid face remains available with an
explicit generation error; local edits do not hide the missing choices.
The owner handles persistence/closing, and must bind its save callback to the
submitting identity: unmounting cannot undo a persistence operation already
started outside this component. No Firebase or sync behavior is implemented here.

Run the focused codec, renderer and chooser tests with one worker:
`npm test -- --maxWorkers=1 src/lib/avatar.test.ts src/components/avatar`.
The browser suite uses the existing Playwright dependency and an installed
Chrome, with an ephemeral loopback Vite server and in-memory fixture. It never
starts the app's catalog handler, loads a production route, or contacts a
Firebase resource. No production preview route is added.
