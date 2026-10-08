# Single-ticket publication and recovery

Load only when continuation requests publication or recovery of an independently reviewed standalone candidate. The review entrypoint owns the exact approval packet; a clean verdict alone is not publication authority.

Only after current exact authority from that packet is satisfied:

1. Immediately re-run receipt `verify` against the candidate directory before any write, requiring unchanged candidate and manifest hashes and the reviewed base SHA. Verify the reviewed base ref still resolves to the plan's 40-character base SHA. Drift returns the plan to review before publication.
2. Verify `ready-for-agent` exists. Do not create missing workflow labels.
3. Re-read the existing target immediately before mutation. Recompute the reviewed issue-state digest and require an exact match. Any title, body, label, state, assignee, or native-parent drift returns the plan to review before a write. Also require no `type:parent`, `ready-for-dev`, or `in-progress`, and no competing owner. For `create new`, repeat duplicate search immediately before creation.
4. Update only the designated issue, or create one issue using the reviewed proposed title and body. Preserve non-conflicting user labels. Remove `plan:ready-for-review` and `plan:ready-for-tickets` if present. Apply `ready-for-agent` after the body update when it is not already present. Do not publish scope in a comment.
5. Re-read and verify repository, number, title, exact reviewed body, open state, no native parent, `ready-for-agent`, and absence of `type:parent`, planning labels, `ready-for-dev`, and `in-progress`.
6. Delete only the task-specific temporary directory after complete read-back. Hand the verified issue URL and any carried launch authority to `codex-development-loop`.

If a write partially succeeds, retain the directory, report exact live state, and resume by read-back rather than creating a duplicate. Missing authority or a binding drift stops writes and returns to its owning review/approval step. Publication does not authorize terminal merge, deployment, production/destructive actions, or credential use.
