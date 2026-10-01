/**
 * `?` and the parameters, or nothing when there are none. URLSearchParams.size would tell the same, but browsers gained
 * it only in 2023 (Chrome 113, Firefox 112, Safari 17), above Play 100's floor (README.md): in older ones it reads
 * undefined, so every query built that way came out empty, and a game card's link opened nothing on a Galaxy A03s
 * (WebView Chrome 106).
 */
export function querySuffix(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : '';
}
