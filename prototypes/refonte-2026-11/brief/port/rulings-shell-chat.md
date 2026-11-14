# Lead designer's rulings — group shell-chat (areas: shell, chat-home)

The review ran while the machine was saturated (load 40). Findings of the kind "a click did nothing", "still pending" must be
replayed on the calm server before any code change.

## Already changed by the lead (do not undo)
- Home: the "learned about you" suggestion is a small tile (ThingGrid cols=3); the briefing lines are 15px and a line's source
  numbers never start a line alone (recherche/home.tsx BriefingSheet).
- Answers: markCited joins adjacent runs of the same source; the source panel marks only the words reused by the citing
  sentences (lib/source-marks.ts citingSentences; discussions/preview.tsx passageParts, NEAR = 120).
- Shell: the "[" shortcut ignores fields, dialogs and menus (app-shell.tsx). The dead `initialOf` left brand.tsx.
- Avatar initials keep letters only ("David (démo)" gives DD).
- The Home briefing sheet's layout (uneven columns, three title levels) is the lead's to rework: do NOT restyle
  BriefingSheet. Only fix its React keys.

## shell
1. MAJOR — the command bar says "Connected" for a broken tool. FIX: same rule as readSidebar (a connection in error or
   stopped is not "connected"); a broken one reads "Needs reconnecting" and its row opens /connexions?outil=<id>. Test.
2. MAJOR — the workspace's full name appears nowhere. FIX: the account menu's head shows the person's name, then the full
   workspace name, then the email (muted). The sidebar row keeps its truncated caption.
3. minor — typing "lin" found no Linear row. REPLAY; if a slower earlier request can overwrite a newer one, keep only the
   answer to the latest query (test).
4. minor — Enter on "Ask Leon: …" still pending after 7 s. REPLAY on the calm server; the row must show it is working, and a
   failure must say so (no silent hang).
5. minor — Recents: 36px always reserved for the hidden three dots. FIX: the title uses the whole row at rest; the dots take
   their room only on hover or focus (always on touch).
6. minor — the "Reconnect <tool>" row of the command bar has an empty icon slot. FIX: the tool's logo.
7. minor — the command bar with nothing typed is tall and lists the screens. BY DESIGN.
8. minor — who sees the reconnect alert. FIX: the sidebar alert line and the flag on "Connections" count only the tools THIS
   person can reconnect (the same right as the "Reconnect" pill of the card). With several: "N tools need reconnecting"
   (a plural key, English and French), opening /connexions. Test.
9. minor — two alert lines at the sidebar's foot. BY DESIGN (two different facts).
10. minor — the heading sits 76px higher on screens without the top bar. BY DESIGN.
11. minor — after deleting a recent discussion with the keyboard, focus falls on body. FIX: focus goes to the next row's
    link, else to the new-discussion entry.
12. minor — a docs guide test keeps the old French label. LEFT unless a test fails.
13. minor — Cmd+K on the search results screen opens the command bar. FIX: on a screen that has its own ask or search field
    (search results, new discussion, a thread), Cmd+K focuses that field. One place to ask (remark 6).

## chat-home
1. MAJOR — creating a discussion could not be confirmed. REPLAY on the calm server (type, Enter, land on /discussions/<id>,
   the answer arrives; the dev model is a fake that answers one sentence). Delete what you create.
2. MAJOR — the highlighter. Keep RUNS_PER_SENTENCE as it is (to be judged with a real model). FIX only: in the source
   panel, a long passage (a turn over 400 characters cited as a whole) must still get the best shared run marked, never
   nothing. Unit test.
3. MAJOR — counts on screen ("About 16 sources", "From 7 search results"). FIX: "Sources" and "Search results"; the count
   may stay in the accessible name only. English and French.
4. minor — the thread's head repeats the first question. BY DESIGN.
5. minor — the briefing sheet's layout. The lead's (see above). Fix only the keys (index + text).
6. minor — the briefing stays English in the French interface. BY DESIGN (stored text).
7. minor — result tiles no longer show author, date, passage. BY DESIGN (the founder's rule).
8. minor — probably dead message keys (discussions.subtitle, private, empty*, keyboardHint; welcome…). FIX: grep each;
   delete from both files the keys nothing reads (src/test/contracts/translation-keys.test.ts must stay green; dynamic reads
   count as reads).
