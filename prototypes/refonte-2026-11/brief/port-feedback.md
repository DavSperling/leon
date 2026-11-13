# Founder's feedback of November 11 (evening), to build into the port

He clicked through the whole prototype (`papier/app/` and the public pages) and sent this. It overrides the prototype
and the earlier briefs wherever they disagree. His screenshots: `<SCRATCH>/port/david-feedback-1-chat.png` (two places
to ask), `-2-rail.png` (the "K" and "JM" buttons), `-3-team.webp` (the tiles of people), `-4-thread.webp` (his
questions on the left).

## His words, translated, and what to do

1. "Make the documentation appear." The public site's navigation shows Documentation, and the page exists in the new
   look (the real `/documentation` page, restyled).
2. "Put the Sign in button to the right of Create workspace (separate the navigation tabs clearly from the sign-in
   part)." Public header: the logo, the navigation links, then, clearly apart at the far right, "Create a workspace"
   and "Sign in" to its right.
3. "Add a dark mode (important)." The new look gets a dark theme, in the app and on the public site. The real app
   already has the mechanism (the `data-theme` attribute, the stored choice, the switch): keep it, and give it a dark
   Papier palette. Starting point: the home page's terminal palette in `papier/css/tokens.css` (`--term #1C1C19`,
   `--term-line #2E2E2A`, `--term-text #D6D6CF`, `--term-dim #9C9C94`) on an ink desk; sheets a step lighter than the
   desk; the primary button inverts (a paper pill, ink text); flags keep their colours with ink text; a highlighter
   stroke becomes a tint of its colour behind light text, still readable at 4.5:1; hairlines instead of shadows. The
   light theme stays the default. (This cancels the earlier decision to drop the dark theme.)
4. "Finish the Pricing and Documentation pages." Both complete, in the new look, from the real pages' content.
5. The logo: "I like the three coloured strokes. I can take care of it later." Do not redraw the logo. His idea: "an
   animation, the logo moving when the page loads": a short one (the mark's three lines drawing in, about 600ms, once,
   off under reduced motion) on the public header and the sign-in pages.
6. "We have Ask Leon, and at the top again something to ask: we must define well what goes here." One place to ask per
   screen. On the screens where the person asks (a new discussion, a discussion), the field of the page is the only
   one: the top bar is not shown there. Everywhere else the top bar stays, as the quick way to ask Leon or to find a
   tool, a person, a document, a discussion or a screen; its words say both ("Ask or search…"). Cmd+K opens the
   command bar on every screen.
7. "I don't like the JM button and the K on the side either: find something more designed." The collapsed sidebar must
   not show two letter squares. Decision: no workspace tile in the rail (the workspace's name shows when the sidebar
   is open, and switching lives in the person's menu); the person is a round avatar (a photo when there is one,
   otherwise initials, quiet, with an ink ring on hover and focus). In the open sidebar, the workspace row and the
   person's row get the same care: no black square, no pastel square.
8. "For the team page, we had made a tree: that seems better; and below, the list of users if one needs to see it."
   The Team screen is the real organisation chart (it exists: `src/components/verre/equipe/`), in the new look, and
   under it the list of people, folded by default ("Show everyone"), as tiles; a person's panel as designed.
9. "When I talk to it, my text shows on the left instead of the right." In a discussion, what the person wrote sits on
   the right (as the real app does today), and what Leon answers on the left, on its sheet. The first question is no
   longer a big title on the left.

10. On an answer: "No need to highlight all the text: highlight only the element that is found in the source. That
    way, when the text is long, not everything is highlighted." In an answer, the highlighter marks only the words
    that come from the source (the name, the date, the figure, the few words the source really says), in that source's
    colour; the rest of the sentence is plain ink, and the number still follows the sentence. In the real app this is
    computed, not hand-written: for each cited sentence, mark the longest run (or the two longest runs) of words it
    shares with the cited passage, ignoring case and small words; a number, a date or a proper name alone counts; when
    nothing is shared, mark nothing and keep the coloured number. A small pure function with its test. A long answer
    must read as ink with a few marks, never as a coloured block.

11. On the sidebar's "Recent" list (his screenshot: `<SCRATCH>/port/david-feedback-5-recent.png`): "Here too, the
    three little dots: it must let me delete the discussion." Each recent discussion has a three-dots button (shown
    on hover and on keyboard focus, always there on touch) opening a small menu with "Delete", confirmed, with the
    real consequence (the discussion and all its messages, for good). Deleting the open discussion leads to a new
    one. The title's own ellipsis must leave room for the button.

12. On the side panel (his screenshot: `<SCRATCH>/port/david-feedback-6-panel.webp`, Gmail's panel open): "If I click
    on GitHub it opens GitHub's panel while I already have one open. No: wherever I click, it must close the open
    one; then I click again to open the right one." A click outside the open panel only closes it. It never opens
    another thing in the same click. (The prototype's last pass had added the opposite: undo it.)
13. On Team: "Think of something really logical to add users directly in the tree: easy to reach, and easy to
    organise well." The organisation chart is where people are added and placed:
    - under each person, a quiet "+" (on hover and on focus; always there on touch): "Add someone under <Name>"
      opens the invitation with "Reports to" already set; the page's ink pill "Invite" does the same with nobody set;
    - an invited person appears in the tree at once, at that place, marked "Invited";
    - people who report to nobody sit in a row of their own, "Not placed yet", next to the tree;
    - moving someone: "Reports to" in the person's panel (a searchable choice, with the product's own refusals: a
      loop, the owner), and dragging a person onto another as the quick way, never the only way.
    Check what the back-end already holds (managers, placement, invitations) in the maps; where an invitation cannot
    carry "reports to" yet, add it in the back-end, with its test.
14. On the invitation: "When the link is generated, there must be the option to send it by email directly to the
    user." Once the link exists: "Copy" as today, and "Send by email": an address, "Send", then "Sent to <address>".
    This is new in the back-end (today Leon does not send invitations): an action that sends the link through the
    mail sender the product already uses for password resets, in English and in French, allowed to those who may
    invite, under the existing limits on invitations, refused in plain words when the address is malformed or the
    mail service is not configured (the local setup has none: say so instead of pretending). With its tests. The
    sentence "Leon does not send emails" goes away.

## Also seen on his screenshots
- A discussion of nonsense questions stacks three identical "I don't know" sheets: fine as content, but the refusal
  "Leon was already replying in this discussion. Your question is back in the composer." was cut by the bottom of the
  window: a message under the field must always be visible.
