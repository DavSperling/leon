# Lead designer's rulings — group team-settings (areas: team, settings)

## Already changed by the lead (do not undo)
- Team: "Everyone", folded, is a row of faces + "Show everyone" + a chevron under the title (equipe/index.tsx); names are
  sorted with the interface locale. The "+" under each person appears as soon as the pointer enters the tree (group/tree
  in org-chart.tsx). "Send by email" is ONE shared component (equipe/send-by-email.tsx), used by the invitation panel and
  by the onboarding's teammates step. The invitation panel and the token panel are locked while the creation is pending.
- Settings › Workspace: the organisation's picture is the kit Glyph with a building icon (no ink letter square: remark 7).
- The translation-keys contract reads settings.connectedTitle.

## team
1. BLOCKER — "clicking a tile opened no panel; a hydration error on /equipe". The lead replayed it at 10:06 on the calm
   server as claire: no console error, the click opens the panel, ?personne= in the address. NOT REPRODUCED so far, but
   look once more with an invited person in the tree and with a tile dragged then clicked; if you can make it fail, fix it.
2. MAJOR — explaining sentences in the invitation panel. FIX: remove the help "To tell links apart" under Name and "Same
   scale in every company" under Seniority (the onboarding reads the same keys: remove the helps there too; you may edit
   src/components/verre/onboarding/placement-fields.tsx and invite-form.tsx for this only), and remove the foot note "By
   default, everyone can see…" from the invitation panel. Keep "Copy it now; it won't be shown again." Delete from both
   message files the keys nothing reads any more.
3. MAJOR — "Role" is the job in the invitation panel and the access level in the person's panel. FIX: the job is
   "Position" in English wherever it is labelled (the onboarding's label too), and "Role" only means Member / Admin / Owner.
   Check the French pair ("Poste" / "Rôle") the same way.
4. MAJOR — seven ink pills ("What you follow") in the panel of a person under the reader. FIX: quiet outline pills with a
   check when on (one ink pill per view). Drop "What you tick changes nothing for anyone else." Keep the legal sentence of
   the "see their private items" switch.
5. MAJOR — the panel closes while "Create the link" is pending. DONE by the lead: verify.
6. minor — captions cut in the 208px tiles. FIX small: the full text as the title attribute; do not widen the tiles.
7. minor — the faces overlapped. DONE (no overlap now). FIX: under 640px show at most 5 faces and keep "Show everyone" on
   one line.
8. minor — at 390px the chart opens scrolled with no hint. FIX if cheap (a soft edge on the side that scrolls), else LEFT.
9. minor — the "+" is hard to discover. DONE by the lead.
10. minor — the French caption "Invitation en attente" is long. FIX: "En attente".
11. NEW, from the lead — after "Show everyone" the button unmounts and focus falls on body. FIX: on open, focus goes to the
    search field; on "Hide", focus returns to "Show everyone".
12. Not seen live by the review: French, dark at 1512, 1280x800, the group and directory panels, the loop refusal in the
    panel. Look at them now.
Never change a role, remove a member or flip the managers switch on the shared accounts. An invitation named "david" was
created by the founder himself at 10:19: never touch it. You may cancel the leftover "check-team-4" invitation through its
own panel.

## settings
1. MAJOR — secret-producing panels are not locked while the action runs. The token panel: DONE by the lead. FIX the same in
   security-settings.tsx (change the password, turn two-factor on, regenerate the codes): locked while pending and while a
   secret is on screen.
2. MAJOR — focus is lost (body) after a refused outside click on a locked panel, and after Revoke / Disconnect. FIX: you
   may edit src/components/verre/ui/side-panel.tsx for this only (a refused outside click keeps focus inside the panel);
   after Revoke / Disconnect focus goes to the next card, else to the section's heading (tabIndex -1).
3. minor — the prototype's hashes #profile, #security, #assistants, #workspace open nothing. FIX: accept them as aliases.
4. minor — before hydration the Language and Theme selects are empty and the group jumps. FIX if cheap (the selects carry
   their value in the server's HTML), else LEFT.
5. minor — sentences at rest. KEEP the legal sentence under Managers. Shorten the "About you" help to one short line
   (English and French).
6. minor — the "Connected 3" flag. BY DESIGN (a section flag, as on Connections).
7. minor — the computer card's caption, the assistant panel's first row repeating its title. FIX small: drop the row that
   repeats the title; leave the caption.
8. minor — the Save pill (two ink pills when the form is dirty; not sticky). LEFT (report it).
9. minor — the workspace letter square. DONE by the lead.
10. minor — at 390px the chips wrap; at 1280 the sheet is not centred. FIX the chips (one row that scrolls sideways, no page
    overflow); leave the 1280 alignment.
