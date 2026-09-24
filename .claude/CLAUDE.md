# thuum

Project workspace scaffolded by `/incept`.

- The article draft lives in `docs/private/post.md` (gitignored). It carries the
  mojibake.dev frontmatter; write the body in Obsidian format: fenced code blocks,
  bare `![[image-name]]` embeds (drop the files in `docs/private/attachments/`, any
  names, and `/publish` resolves + copies them), and `==highlight==`.
- General, committable documentation goes in `docs/`.
- When the draft is ready, run the global `/publish` command from this directory:
  `/publish` (site + LinkedIn), `/publish --to github`, or `/publish --to linkedin`.
