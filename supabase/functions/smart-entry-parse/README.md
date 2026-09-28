# Smart Entry parser

This authenticated Edge Function is the Gemini language-understanding fallback for Smart Entry. It only returns a structured candidate and never performs a financial mutation.

Required secrets:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional; defaults to `gemini-3.1-flash-lite`)

Common daily entries are parsed locally in the browser and do not call this function. The function is used only when the local parser cannot safely understand a complex relationship. On missing key, quota, timeout, or malformed provider output, the client preserves its local draft and opens manual completion instead of losing the text.

The browser sends only the current, RLS-scoped labels needed for interpretation. IDs, balances, auth/session secrets, debt amounts, and unrelated transaction history are excluded. Gemini can return natural labels only; the browser resolves labels to allowed KASH resources again before the user can confirm an existing KASH service or RPC.

Voice uses the browser's `SpeechRecognition` API when available. KASH does not record or persist raw audio; the recognized transcript is shown in the composer and follows the same hybrid parser path as typed text.
