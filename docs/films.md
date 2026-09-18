# Optional collection films

The collection remains a browsing surface, not a video landing page. Its hero
and navigation stay unchanged so mobile search remains in the first viewport.
One compact Watch films row (`#collection-films`) sits after the collection and
before the workbook: **The 100**, then **Discover & compare**. Both are finished,
first-party files supplied by the authorized film
producer. No unfinished clip or placeholder is published.
The public `/#collection-films` link aligns and focuses the section after the
collection's asynchronous load settles, without opening or preloading a movie.

## Playback contract

- No video element or MP4 `src` exists until an explicit Watch action. Lazy
  posters have intrinsic dimensions and a readable failure fallback.
- One native, inline, keyboard-accessible player opens in the existing modal
  dialog. It does not autoplay. Music starts only through the viewer's native
  Play action; reduced motion does not start or loop the film.
- Switching films, closing, Escape, navigation or unmount pauses and unloads
  the old source. Hidden documents pause without automatic resume. Focus returns
  to the opener, scroll is restored, and mobile safe areas remain clear.
- Failed media shows an explicit Retry and Download alternative. Transcript,
  captions and source/music credits are progressively disclosed; editorial demo
  footage is clearly described and is never presented as a real user's account.
- Content-hashed MP4/poster/credit files are static same-origin assets. No
  player iframe, analytics, new API, server proxy or paid media host is added.
  Git preserves the exact media and companion-file bytes without newline
  normalization. Hosting must serve `video/mp4`, HEAD and byte-range `206` responses.

## Acceptance

Desktop and narrow mobile must demonstrate zero MP4 requests before Watch,
native playback and seeking for both films, source unload on close/switch/Back,
focus restoration, reduced-motion behavior, poster/media failure and retry,
working downloads and no page overflow at 320/1440 pixels. Original collection
filter/rank/rating and queue actions must remain usable. Production verification
checks MP4 byte hashes, `moov` before `mdat` (fast start), MIME/HEAD/ranges, unchanged
auth-helper framing/CSP/no-store and original collection/workbook hashes.

`src/lib/films.test.ts` checks exact asset bytes, poster dimensions, the two-film
order, MP4 atom order, audio captions and hosting policy. `tests/films.spec.ts`
uses actual Chrome native controls at desktop and narrow mobile sizes, including
delayed-data fragment landing. Its media request counter includes ordinary page
load and scrolling before Watch. Failure fixtures affect only media responses,
not product permissions or private state. Collection regression coverage remains
in `tests/collection.spec.ts`.

The films are supplied by the authorized producer and are not re-encoded by the
website. The original-100 film uses the existing user-provided workbook
thumbnails within an editorial product demonstration, not newly licensed
general-purpose cover art. The other film uses its documented public-domain
logos and clearly labelled demo friends/ratings. Exact credits and authoritative
timecoded transcripts ship with each film; the ambient caption track identifies
the instrumental music/clicks and absence of speech.
