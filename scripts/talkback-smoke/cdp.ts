/**
 * Reads page state from Chrome on the emulator through the DevTools socket (forwarded to CDP_PORT).
 * Observation only: the journeys move focus with real key events; this never clicks or focuses anything.
 * Usage: node scripts/talkback-smoke/cdp.ts '<expression>'  — prints the expression's JSON value.
 */
export {};

interface Target {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface EvaluateReply {
  id?: number;
  result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } };
  error?: { message?: string };
}

const expression = process.argv[2] ?? 'document.title';
const port = process.env.CDP_PORT ?? '9222';
const origin = process.env.TARGET_ORIGIN ?? '';

const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Target[];
const page =
  targets.find((target) => target.type === 'page' && origin !== '' && target.url.startsWith(origin)) ??
  targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
if (!page?.webSocketDebuggerUrl) throw new Error(`No debuggable page: ${JSON.stringify(targets)}`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
const value = await new Promise<unknown>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('CDP evaluate timed out')), 10_000);
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
  socket.addEventListener('message', (event: MessageEvent<string>) => {
    const reply = JSON.parse(event.data) as EvaluateReply;
    if (reply.id !== 1) return;
    clearTimeout(timer);
    if (reply.error) reject(new Error(reply.error.message));
    else if (reply.result?.exceptionDetails) reject(new Error(reply.result.exceptionDetails.text));
    else resolve(reply.result?.result?.value ?? null);
  });
  socket.addEventListener('error', () => reject(new Error('CDP socket error')));
});
socket.close();
console.log(JSON.stringify(value));
