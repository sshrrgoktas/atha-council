# Google login from the unified AthalAI app

AthalAI embeds the existing Council on desktop and Android. Google login uses the system browser and returns to the same AthalAI app, using the existing mobile S256 handoff rather than exposing Council cookies to the remote page.

The optional `client=athalai` marker on `/auth/google/start?mobile=1&challenge=...` selects the fixed `athalai://council-auth/google` return. The marker is included in the authenticated ticket and must match at `/auth/google/mobile-exchange`. The default `atlascouncil://google-auth` return for the old Council app and ordinary browser login keep their existing behavior. Registered provider HTTPS callbacks, secrets, account data and model routes are unchanged.

The native client keeps a short-lived private verifier, accepts only a matching pending flow, exchanges at the fixed Council HTTPS origin, and installs only the returned Council Google cookie. The existing Council account and history remain authoritative; local history in a different app is not silently imported.

Run `node --test worker/google-handoff.test.cjs` for isolated route checks with fake provider responses. No real provider login is performed by these tests. Deploy only production.js content to the existing atlas-council Worker, retaining all existing bindings and configuration.
