# Browser Driving

Use the Browser Use skill for the Codex Desktop in-app browser. Initialize the `iab` backend through the Node REPL before browser work.

For interactive MWF playthroughs, this is the default and required browser surface. Do not launch external Chrome, system Chrome, or a separate Playwright browser for a normal "open localhost", "drive this session", or "continue as Jason" request. If a browser automation path defaults to Chrome, stop and switch to the in-app `iab` backend instead.

This skill plays one user in one in-app browser. If the user wants both partners played by Codex, recommend two Codex sessions, each using its own in-app browser. Automated Playwright two-context runs belong in a separate eval-harness workflow, not the default skill behavior.

## Bootstrap

```js
if (!globalThis.agent) {
  const codexHome = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
  const { setupAtlasRuntime } = await import(`${codexHome}/plugins/cache/openai-bundled/browser-use/0.1.0-alpha1/scripts/browser-client.mjs`);
  const backend = 'iab';
  await setupAtlasRuntime({ globals: globalThis, backend });
}
await agent.browser.nameSession('MWF session test');
if (typeof tab === 'undefined' || !globalThis.tab) {
  globalThis.tab = await agent.browser.tabs.selected();
}
console.log(await tab.url());
console.log((await tab.playwright.domSnapshot()).slice(0, 12000));
```

## Reading State

Prefer `tab.playwright.domSnapshot()` for chat state. MWF chat renders newest messages first. The latest MWF prompt is usually the first large AI message in the snapshot after header controls.

Use screenshots only for:

- visual layout bugs
- modals/drawers/cards
- CTA placement
- overlapping text
- waiting/input state

## Sending Chat

Prefer the visible placeholder when available:

```js
const replyText = '...';
const input = tab.playwright.getByPlaceholder('Type a message...', { exact: true });
if (await input.count() !== 1) throw new Error('Expected one chat input');
await input.fill(replyText, {});
await input.press('Enter', {});
await new Promise(r => setTimeout(r, 18000));
console.log((await tab.playwright.domSnapshot()).slice(0, 14000));
```

If Playwright fill/Enter fails in React Native Web, inject through the native textarea setter and dispatch Enter:

```js
const ta = document.querySelector('textarea');
const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
setter.call(ta, 'message text');
ta.dispatchEvent(new Event('input', { bubbles: true }));
ta.focus();
ta.dispatchEvent(new KeyboardEvent('keydown', {
  key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
  bubbles: true, cancelable: true
}));
```

## Clicking RNW CTAs

Milestone CTAs may be styled `div`s. If regular Playwright click fails, find the text node, walk up to the clickable parent, and dispatch pointer events:

```js
const txt = Array.from(document.querySelectorAll('*'))
  .find(el => el.textContent.trim() === "I feel heard" && el.children.length === 0);
let btn = txt;
while (btn && !btn.onclick) btn = btn.parentElement;
btn.click();
['pointerdown', 'pointerup', 'click'].forEach(t => {
  btn.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerType: 'mouse' }));
});
```

## Session-Driving Heuristics

- If the user says only "use this skill as <character>", use the current in-app browser tab and current URL if available.
- Continue naturally if MWF asks an open question and the chat input is available.
- If the assigned character has a visible share, validate, continue, review, confirm, skip, decline, or milestone CTA, click it and keep going. Do not ask the user for extra confirmation; in local/E2E gold-session testing these are assigned-role actions.
- Wait rather than nudge when a streaming response or typing indicator is present.
- If blocked on partner action, do not send filler. Check DB if the UI message is unclear.
- Do not switch to the partner account in the same browser context. Report the partner action needed instead.
- After sending, sanity-check the URL. If it moved to `/inner-work/...`, return to `/session/<id>` before continuing the partner session.
- If the browser shows the wrong user's private/personalized message after a realtime transition, record an isolation/cache bug and reload only if needed to continue.

## UX Notes To Collect

- Input visible during partner-wait states.
- Waiting copy that does not say exactly who/what is pending.
- Internal implementation terms in user-facing copy.
- Duplicate or stale share/review CTAs.
- Drawers or modals stacking instead of superseding each other.
- Stage header, CTA, and DB gate contradictions.
