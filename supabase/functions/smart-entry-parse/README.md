# Smart Entry parser

This authenticated Edge Function is the only AI boundary for Smart Entry. It returns a structured draft and never performs a financial mutation.

Required secrets:

- `OPENAI_API_KEY`
- `SMART_ENTRY_OPENAI_MODEL` (optional; defaults to `gpt-5-mini`)

The browser sends only the current, RLS-scoped resource labels needed to resolve the entry. IDs, balances, session secrets, and unrelated transaction history are excluded. The browser matches returned labels to allowed IDs again before the user can confirm an existing KASH service or RPC.

Voice uses the browser's `SpeechRecognition` API when available. KASH does not record or persist raw audio; the recognized transcript is shown in the composer and follows the same parser path as typed text. Browser/vendor speech handling must be reviewed separately for the target deployment.
