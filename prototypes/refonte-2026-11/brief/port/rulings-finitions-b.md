# Lead designer's rulings — group finitions-b (areas: documents-admin, connections, auth-onboarding, site). Last round:
# small finishes only.

Everything else in these four areas was fixed and verified in the previous round (qa/verify-docs-connections.md,
qa/verify-auth-site.md): do not reopen it. No CSS gradient anywhere (the founder banned them): solid colours only.

## connections
1. FIX — the connect panel of a key tool closes on Escape or an outside click while the button says "Testing…": lock the
   panel while the test is pending (as documents/add-panel.tsx does while sending).
2. FIX — a tool with two accounts connected by the same person: both blocks carry the same heading. When two headings
   collide, the heading is the account's label.
3. LEFT — the long helps of the Intercom connect panel (they come from the server's catalogue).

## documents-admin
4. FIX — the delete confirmation of an "Only you" document says "search and answers stop using it, for everyone": say
   "for everyone" only for a team or group document; for a private one, "for you" (English and French).
5. FIX — the add panel keeps its last "Visible to" choice across openings: it goes back to the default when the panel
   closes.
6. FIX — /admin at 390px: the value of a tile ("0,000 $US") is wider than its box: one size down under the sm breakpoint.
7. LEFT — the slow delete while the indexing worker reads other files (a database matter), and the French strings of
   /admin.

## site
8. FIX — /securite hero: the highlight rises 5px over the line above and cuts the tail of the "y" of "exactly". The mark
   must never be taller than its own line (shorter box, or painted behind the text). No gradient.
9. FIX — public header at 1024px: "Leon" (the logo's word) and the first link "Product" are 8px apart. At least 24px
   between them at every width where the links show (hide the word below 1100px if that is the simplest).
10. FIX — /documentation: choosing "For an agent" removes the hero's buttons and the switch jumps 68px under the cursor.
    The switch does not move when the choice changes.
11. After the previous round's hero change (top padding now the bar + 24px at every width): look at /accueil at 390x844
    and 1024x768 and fix what is off.

## auth-onboarding
12. FIX — onboarding tools step at 390px: the install command breaks inside a word ("instal" / "l | sh"). The code box
    scrolls sideways (overflow-x auto, white-space pre); it never breaks inside a word.
13. LEFT — the About step's refusal state 11px past the fold; "Coming soon" for tools that are only not configured on
    this server.
