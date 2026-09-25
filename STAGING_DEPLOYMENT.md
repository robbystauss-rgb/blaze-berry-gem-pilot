# REC Mama Made staging deployment

This branch is the validated staging source for REC Mama Made.

- Deploy from `staging` only until staging QA is approved.
- Keep `recmamamade.com` production unchanged.
- Run `npm run check:assets`, `npm run typecheck`, and `npm run build` before deployment.
- Treat `src/data/master-catalog.json` and verified REC Mama Made material assets as authoritative.
- Do not substitute generated or unverified product imagery.
