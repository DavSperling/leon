# Lead designer's rulings — group auth-site (areas: auth-onboarding, site)

The reviews ran on a busy shared server. "A link did not navigate after 10 s" must be replayed on the calm server first.

## Already changed by the lead (do not undo)
- Onboarding done step: one highlight only (the title).
- "Send by email" is ONE shared component (src/components/verre/equipe/send-by-email.tsx), used by the teammates step.
- Another fixer (team-settings) has just edited src/components/verre/onboarding/placement-fields.tsx and invite-form.tsx
  (two help lines removed, the job is now labelled "Position"): read them as they are now, keep those changes.

## auth-onboarding
1. MAJOR — "Open Chat" (done step) and "Continue" (tools step) did not navigate after 9 to 10 s. REPLAY on the calm
   server; if they navigate, "not-reproduced".
2. MAJOR — tools step: two explaining paragraphs in "Your coding tools" and a dashed box "No tool can be connected on this
   server yet…". The words of the "Your coding tools" card are the agreed consent wording (what the installer does, "the
   boxes on that page are yours"): BY DESIGN, do not rewrite them. FIX only the dashed box: one short line (it shows only
   on a server with no connector key).
3. MAJOR — teammates step: a two-line lead at title size, plus "Copy it or email it. It works once and expires in 7 days."
   FIX: the lead is ONE sentence at lead size (15px), e.g. "One link per person. They see their department, position and
   seniority, and cannot change them." and the note under a link is the two facts only: "Works once. Expires in 7 days."
   English and French.
4. MAJOR — "and 34 more" under the coming-soon tiles. FIX: no number ("and more" / "et d'autres"), or nothing.
5. MAJOR — About step, refusal state: the Position select sits 12px lower than Department once Department shows its
   error. FIX: the pair aligns on its top (items-start).
6. MAJOR — About step at 1512x771: the sheet runs past the window (Continue at y 717, the sheet ends at 770). FIX: tighten
   the vertical rhythm so that, with no refusal showing, the whole sheet and its Continue pill sit inside 771 with air
   under them (about 24px), at 1512x771 and 1280x800.
7. minor — the language buttons are submit buttons that come first in the DOM. LEFT.
8. minor — sign-up at 390: the pile of documents under the form. FIX: hidden under 600px.
9. minor — done step: the 13px line "Setting up your workspace" is cramped. FIX: remove that status line for the owner and
   for the member (title, sentence, button); delete the keys nothing reads (English and French), keep the tests green.
10. minor — About step preview: before any choice the right column shows only a highlighted "Setting up your workspace".
    FIX: nothing highlighted before something is set (a quiet empty state, or nothing).
11. minor — the stepper's current step is an ink disc beside the ink "Continue" pill. FIX: an outline ring with the number
    in ink (one ink pill per view).
12. minor — the sign-up field's focus ring is heavier than the prototype's. LEFT (the kit's ring, kept for visibility).
13. From the site review — the "stop animations" switch is no longer on the sign-in and sign-up pages. Check that nothing
    there moves for more than five seconds (the logo draws once, about half a second). If so, BY DESIGN; if something
    loops, stop it or bring the switch back.
14. Never seen live: the invitation page ("join as…"). Look at it now: as claire create one invitation named
    check-fix-invitee from Team, open its link in a signed-out page, look at it in light, dark, French and 390, do NOT
    submit it, then cancel the invitation from its panel. The authorize pages, two-factor, SSO and the social buttons
    cannot be played on this server: read their code against the prototype's look and report.
The first reviewers left two test workspaces (check-auth-onboarding-co and check-auth-onboarding-ambx): leave them, the
lead removes them. A workspace named "test" and an invitation named "david" are the founder's own: never touch them.

## site
1. MAJOR — home hero about 40px taller than the prototype: the cited-answer demo is cut by the fold at 1512x771. FIX: less
   top padding and a smaller gap between the call to action and the tabs, so that the answer and its three source rows
   end above y=771 at 1512x771, and the sheet is whole at 1280x800 if the words allow.
2. MAJOR — documentation page: three filled ink pills at rest. FIX: the "For you / For an agent" choice is a quiet
   segmented control (outline; the chosen one in a soft fill or underlined, never ink). The hero keeps its ink pill.
3. minor — Product page: the caption "syncs every 15 min" on a rectangle. FIX: delete it.
4. minor — one hydration warning on /connecteurs at 390x844 on a cold load. REPLAY cold at 390 and read the whole message;
   fix if it is real.
5. minor — the header is the same for a signed-in person. LEFT (as before the port).
6. minor — French: "Une équipe, qui essaie Leon sur ses vrais outils." FIX: no comma.
7. minor — home, "When the record is silent": the dashed empty box of the "no source" row reads like an unticked box.
   FIX: a dash inside the flag's outline, or no box.
8. minor — security hero: the blue highlight starts under the descender of "exactly". FIX.
9. minor — header at 390: "Sign in" only inside the menu. BY DESIGN.
10. Never played by a real click (the tool timed out): the footer's language choice, the documentation's "For an agent"
    switch, the logo's draw-in, every footer link. Play them now (dead.mjs on each of the 8 pages).
Do not touch the connectors' "what Leon reads" lines: another agent is checking each one against its connector's code,
and the lead applies the corrections afterwards.
