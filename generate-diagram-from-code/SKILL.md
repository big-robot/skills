---
name: generate-diagram-from-code
description: Use when the user asks for a diagram, flow chart, architecture map, workflow visualization, sequence diagram, system diagram, or code-path diagram derived from code, logs, files, or technical investigation. Always produce a dark-mode SVG file, visually inspect it for clarity and overlap before finalizing, then show the saved file to the user.
metadata:
  skill_library:
    tier: owned
    profile_activatable: true
---

# Generate Diagram From Code

Use this skill to turn code paths, logs, architecture, or technical workflows into a clear diagram artifact.

## Output Contract

- Always create an SVG.
- Always use dark mode.
- Always save the diagram as a file the user can open.
- Do not finalize from an inline SVG alone.
- Before finalizing, inspect the rendered diagram visually and fix overlap, clipping, tiny text, confusing arrows, unclear labels, or inaccurate flow.
- Only after inspection passes, save or update the final SVG file and show it to the user with a local file link. In the Codex desktop app, also display it with Markdown image syntax when possible.

## Workflow

1. Trace the source material.
   - Read the relevant code, logs, routes, functions, or docs.
   - Identify entrypoints, major transitions, external systems, error branches, and the current failure point if any.
   - Keep the diagram faithful to verified behavior. Mark inferences as such.

2. Choose a file location.
   - If the repo has an artifact or docs convention, use it.
   - Otherwise default to `artifacts/diagrams/<short-topic-slug>.svg`.
   - Use an absolute path when linking or displaying the final file.

3. Draft the SVG.
   - Use a dark background, high-contrast text, and restrained accent colors.
   - Prefer grouped boxes, swimlanes, numbered steps, and labeled arrows.
   - Keep labels short. Move detail into small notes instead of cramming long text into boxes.
   - Use stable dimensions and enough padding so text cannot touch box edges.
   - Avoid decorative clutter.

4. Render and inspect before finalizing.
   - Open or render the SVG locally.
   - Look at the actual diagram, not just the source.
   - Check every label for overlap, clipping, legibility, arrow ambiguity, and factual correctness.
   - If anything is unclear, edit and inspect again.

5. Finalize.
   - Save the inspected SVG file.
   - Show the file to the user with a clickable absolute path.
   - Briefly state what the diagram covers.

## Visual Standards

- Background: near-black, for example `#0b1020` or `#0f172a`.
- Primary panels: dark slate, for example `#111827`, `#1e293b`.
- Text: light, for example `#e5e7eb`, with muted secondary text like `#94a3b8`.
- Use color to distinguish roles or states:
  - Blue or cyan for app/service steps.
  - Amber for external systems.
  - Green for successful persistence or completion.
  - Red for failure points.
- Minimum text size: 12px for labels, 14px for normal body, 18px or larger for title.
- Keep every box wide enough for its longest label, or split the label into multiple lines.

## SVG Authoring Rules

- Prefer plain SVG elements and embedded CSS.
- Do not rely on external fonts, images, scripts, or network assets.
- Use ASCII arrows in text (`->`) if needed; use SVG paths with markers for visual arrows.
- Include a title at the top and a short note when the diagram includes a production observation, assumption, or failure point.
- If the diagram maps code, include a small “Files to inspect” area with the most important paths.

## Inspection Options

Use whichever is available and lowest friction:

- Open the SVG in the in-app browser or a local browser.
- Convert to PNG with an available renderer and inspect with the image viewer.
- Use a screenshot if the diagram is browser-rendered.

Do not claim the diagram is clear until you have inspected the rendered output.
