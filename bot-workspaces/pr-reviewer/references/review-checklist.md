# PR Review Checklist

Quality criteria for bot PR reviews (Stage 03).

## Correctness

- [ ] Code does what the linked issue describes
- [ ] No logic errors or off-by-one mistakes
- [ ] Edge cases handled appropriately
- [ ] No regressions to existing functionality

## Completeness

- [ ] All requirements from issue are addressed
- [ ] PR description matches actual changes
- [ ] No TODO/FIXME left unaddressed (unless explicitly deferred)
- [ ] Docs updated if code changes affect documented behavior (check PR comments for a "Doc Impact Check" from github-actions[bot], or consult `docs/code-to-docs-mapping.json`)

## Conventions

- [ ] Follows existing code patterns in the area
- [ ] Naming conventions respected (files, variables, functions)
- [ ] No unnecessary refactoring beyond scope
- [ ] Import ordering consistent

## Security

- [ ] No secrets or credentials in code
- [ ] No injection vulnerabilities (SQL, XSS, command)
- [ ] No unsafe deserialization or eval usage
- [ ] Permissions/auth checks present where needed

## Quality

- [ ] Tests present if behavior changed
- [ ] No accidental/unrelated file changes in diff
- [ ] No debug logging left in
- [ ] Documentation updated if public API changed
