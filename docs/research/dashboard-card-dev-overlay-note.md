# Dashboard Cards and Next.js Dev Overlay Note

Date: 2026-05-12

## Dashboard Card Polish

Sources checked:

- Nielsen Norman Group dashboard guidance: dashboards should make status scannable and use visual hierarchy so users can understand the screen quickly. https://www.nngroup.com/articles/dashboards-preattentive/
- Datapad dashboard guidance: put critical metrics at the top, use large clear numbers, and keep supporting context secondary. https://datapad.io/docs/guides/dashboard-best-practices
- Local KushHR UI review: dashboard metric cards were consistent but the primary values felt visually tucked to the left rather than acting as the card anchor.

Decision:

- Keep dashboard cards compact and operational rather than decorative.
- Preserve the existing card grid and links.
- Center the primary value within each card so the number is the visual anchor.
- Keep the label and note subordinate, with the note centered below the value for balance.
- Use tabular numerals for steadier numeric scanning when values change between cards.

## Next.js Dev Overlay

Local docs checked:

- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/devIndicators.md`
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
- `node_modules/next/dist/docs/02-pages/03-building-your-application/06-configuring/12-error-handling.md`

Reviewer note:

- The lower-corner `N` indicator, `Rendering` badge, Route, Bundler, Route Info, Preferences, Position, Size, Hide dev tools, and Disable dev tools controls are Next.js development diagnostics.
- The Preferences theme toggle changes the dev-tools overlay theme only; it is not an application dark-mode control.
- Next.js documentation states the runtime error overlay appears only under `next dev` and is not shown in production.
- Next.js 16 removed older `devIndicators` options such as `appIsrStatus`, `buildActivity`, and `buildActivityPosition`; the supported local configuration is `devIndicators: false` or a `position`.
- KushHR sets `devIndicators: false` in `next.config.ts` to quiet the local indicator while still allowing Next.js to surface build and runtime errors.
