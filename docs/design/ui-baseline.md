# UI baseline

## Design source

Figma is the UI and interaction baseline for layout, navigation, screen flow, component/state details, and responsive intent. The supplied local file is named `KLTN – Trợ lý AI Du lịch Hà Giang – EDU (1).fig`; its contents could not be inspected in this environment. **Figma must be consulted separately** before a story implements specific visual or interaction details. Do not invent frames, layout, or navigation based on the filename.

Figma cannot override Product Document/System Specification business rules, authorization, ownership, deterministic Validator rules, or acceptance criteria. Resolve a conflict using the source hierarchy in [source-baselines.md](../source-baselines.md).

## Responsive requirement

Responsive web is mandatory on desktop and mobile. At 360 px and above, main content should not require horizontal scrolling. PWA support is optional; native mobile is out of MVP scope.

## UX states to specify

Stories should cover relevant states among:

- loading and saving;
- empty results/content;
- recoverable and technical error;
- unauthorized/needs authentication;
- unavailable or hidden content;
- confirmed success;
- Validator violation;
- insufficient validation data or insufficient RAG source.

Do not collapse insufficient evidence/data into success. Show write success only after the server/database confirms it. Preserve input after a recoverable/uncertain write when possible.

## Repository UI snapshot

The current UI is a basic scaffold: a home shell with Home/Dashboard navigation, sign-in/sign-up forms, a user menu, theme controls, and a dashboard that reads the current session. These files are implementation evidence, not a substitute for the Figma baseline or the full product flows.
