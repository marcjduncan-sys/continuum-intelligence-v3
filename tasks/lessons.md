# Lessons Learned

<!-- Claude: after ANY correction from the user, add the pattern here as a numbered rule. Be specific. Include the mistake, the fix, and the rule that prevents recurrence. Review this file at session start. -->

## Rules

1. **Always identify which file Vite actually serves before editing.** Vite's `publicDir: 'public'` means only files under `public/` are copied verbatim to `dist/`. A root-level `js/` directory is NOT copied. Editing `js/personalisation.js` at the repo root has zero effect on production -- `public/js/personalisation.js` is the file that matters. Before editing any classic-script file, confirm its path resolves under `publicDir`. Rule: grep `index.html` for the `<script src="...">` tag, then trace that path through `vite.config.js` `publicDir` and plugin config to verify it lands in `dist/`. (Learned: 2026-03-08)

<!--
Example format:

1. **Never edit src/ expecting production impact.** Production runs from inline script blocks in index.html, not from src/ ES modules. Editing src/ files has zero effect on the live site. (Learned: 2026-02-xx)

2. **Always run the full test suite before marking done.** A passing lint check is not a passing test suite. Run `npm test` and confirm 145/145 pass. (Learned: 2026-02-xx)
-->
