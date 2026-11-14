# Lead designer's rulings — group finitions-a (areas: shell, chat-home). Last round: small finishes only.

Everything else in these two areas was fixed and verified in the previous round (reports qa/verify-shell-chat.md): do not
reopen it. The findings below come from that verification, plus two from the lead.

1. FIX — Recents: after deleting a recent discussion with the keyboard, focus still ends on <body> (the refocus effect
   races the confirmation dialog). Do the focusing when the dialog has closed (its onCloseAutoFocus: preventDefault, then
   focus the row that took its place, else the "New discussion" link); clear the remembered target only once something
   took focus. Play it live with a discussion you create.
2. FIX — command bar: Enter on "Ask Leon: …" then Escape while it says "Asking Leon…" closes the bar; the discussion is
   created silently and the page does not move. While asking, the bar ignores close (Escape, outside click).
3. FIX — command bar: a tool whose connections are ALL paused reads "Connected". It must read like its card: "Paused",
   in the muted colour (English and French). Test in src/server/shell.
4. FIX — the source panel's marks (verre/discussions/passage-parts.ts), founder's remark 10 "highlight only what comes
   from the source":
   a. when the citing sentences share NO run of words with the passage, mark NOTHING (today it marks the first
      sentence: a guess, remove it);
   b. a cited chunk inside a longer turn, cited by sentences that share no run, is marked as one block (measured: 1,259
      of 2,180 characters): it must mark nothing either;
   c. the whole-passage mark stays only for search seeds (when the panel is opened from a search result, with terms).
   Update the unit tests (and keep the panel scrolling to the passage even when nothing is marked).
5. FIX — command bar: the tool rows wait for the server (5 to 7 s under load). Filter the catalogue's names on the
   client at once (the catalogue is known there); the server answer only adds each tool's state when it arrives. People,
   documents and discussions still come from the server. Keep the latest-query guard.
6. FIX — the source panel prints stored Markdown as raw characters ("**Refonte devis** : point du 16/10"). Show the text
   without the emphasis markers (bold, italics, code ticks, heading hashes at a line's start), and compute the marks on
   the text as displayed, so that positions stay right. A unit test with a marked passage that contains "**".
7. FIX — the account menu sticks out about 5px past the right edge of the sidebar at 1512px: it stays inside the
   sidebar's width.
8. LEFT — everything else.
