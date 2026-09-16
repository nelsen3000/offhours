#!/usr/bin/env bash
# PreToolUse(Bash) hook — routes simple git/cargo/npm/pytest/docker commands
# through rtk (https://github.com/rtk-ai/rtk, Apache-2.0) so their output is
# token-compressed before it reaches model context.
#
# Adapted from rtk's own hooks/claude/rtk-rewrite.sh (Apache-2.0, vendored per
# Rule 6). Differences from upstream, both deliberate:
#   1. A compound-command guard: pipes, chains, subshells, redirects, and
#      multi-line commands are passed through untouched. Only a simple,
#      single-statement invocation of an allowlisted tool is rewritten.
#   2. No auto-allow: upstream emits permissionDecision:"allow" for rewritten
#      commands, which would bypass this repo's permission flow. We only emit
#      updatedInput and let the harness apply its normal permission rules to
#      the rewritten command.
#
# Contract (do not weaken):
#   - Safe no-op (exit 0, no output) when rtk or jq is missing, when the
#     command is compound/complex, or on ANY internal error. This hook must
#     never break a Bash tool call.
#   - Rewrite logic itself is delegated to `rtk rewrite` (single source of
#     truth in rtk's Rust registry). Its exit-code protocol:
#       0 + stdout  rewrite found            -> emit updatedInput
#       1           no rtk equivalent        -> pass through
#       2           rtk deny rule matched    -> pass through (native rules decide)
#       3 + stdout  rtk ask rule matched     -> emit updatedInput (no auto-allow)
#
# Verification aid: set RTK_HOOK_SENTINEL_DIR to a writable dir and the hook
# appends one line per invocation (decision + command) — used to prove the
# hook fires at harness level without touching real traffic.

set -u

sentinel() {
  if [ -n "${RTK_HOOK_SENTINEL_DIR:-}" ] && [ -d "${RTK_HOOK_SENTINEL_DIR:-}" ]; then
    printf '%s\t%s\t%s\n' "$(date -u +%H:%M:%S)" "$1" "${2:-}" \
      >>"$RTK_HOOK_SENTINEL_DIR/rtk-hook.log" 2>/dev/null || true
  fi
}

command -v jq >/dev/null 2>&1 || { sentinel no-jq; exit 0; }

# rtk may live off PATH (install.sh -> ~/.local/bin, cargo -> ~/.cargo/bin).
RTK_BIN=""
if command -v rtk >/dev/null 2>&1; then
  RTK_BIN="rtk"
else
  for d in "$HOME/.local/bin" "$HOME/.cargo/bin" /opt/homebrew/bin /usr/local/bin; do
    if [ -x "$d/rtk" ]; then RTK_BIN="$d/rtk"; break; fi
  done
fi
if [ -z "$RTK_BIN" ]; then
  sentinel no-rtk
  exit 0
fi

INPUT=$(cat) || exit 0
CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null) || exit 0
[ -z "$CMD" ] && exit 0

# Already rtk-wrapped — nothing to do.
case "$CMD" in
  rtk\ *|*/rtk\ *) sentinel already-rtk "$CMD"; exit 0 ;;
esac

# Compound/complex guard: single simple statement only. Anything with shell
# metacharacters (pipe, chain, background, subshell, substitution, redirect,
# grouping, heredoc, newline, env-assignment prefix) passes through untouched —
# rewriting inside compound commands can change semantics.
case "$CMD" in
  *'|'*|*';'*|*'&'*|*'$('*|*'`'*|*'>'*|*'<'*|*'('*|*')'*|*'{'*|*'}'*|*$'\n'*)
    sentinel skip-compound "$CMD"
    exit 0
    ;;
esac
case "$CMD" in
  [A-Za-z_]*=*) sentinel skip-env-prefix "$CMD"; exit 0 ;;
esac

# Tool allowlist: first word must be one of the routed CLIs.
first_word=${CMD%% *}
case "$first_word" in
  git|cargo|npm|pytest|docker) ;;
  *) sentinel skip-tool "$CMD"; exit 0 ;;
esac

# Delegate the actual rewrite decision to rtk's registry.
REWRITTEN=$("$RTK_BIN" rewrite "$CMD" 2>/dev/null)
EXIT_CODE=$?

case $EXIT_CODE in
  0|3)
    [ -z "$REWRITTEN" ] && { sentinel empty-rewrite "$CMD"; exit 0; }
    [ "$CMD" = "$REWRITTEN" ] && { sentinel unchanged "$CMD"; exit 0; }
    ;;
  *)
    sentinel passthrough-$EXIT_CODE "$CMD"
    exit 0
    ;;
esac

sentinel rewrite "$CMD -> $REWRITTEN"
# updatedInput only — never permissionDecision — so the harness's normal
# permission flow evaluates the rewritten command.
jq -c --arg cmd "$REWRITTEN" \
  '.tool_input.command = $cmd | {
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "updatedInput": .tool_input
    }
  }' <<<"$INPUT" 2>/dev/null || exit 0
exit 0
