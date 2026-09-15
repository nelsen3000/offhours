#!/usr/bin/env bash
# SessionStart hook — ensure rtk (https://github.com/rtk-ai/rtk, Apache-2.0) is
# installed so the PreToolUse hook (.claude/hooks/rtk-route.sh) can compress
# noisy git/cargo/npm/pytest/docker output before it reaches model context.
#
# Contract (do not weaken):
#   - ALWAYS exits 0. Session startup must never block on an install failure.
#   - Fast path: if rtk is already resolvable, exits immediately.
#   - Slow path: kicks the install to a detached background process and exits;
#     rtk becomes available mid-session or by the next session.
#   - NEVER `cargo install rtk` — that crates.io name is an unrelated
#     name-squatter (a Rust FFI/type kit). Git/source installs only.
#   - Sandboxed remote sessions may block github.com/codeload/crates.io while
#     allowing raw.githubusercontent.com (verified 2026-07-02 in the Claude
#     Code remote env: raw=200, github.com/api/codeload/crates.io=403). The
#     installer script itself downloads release binaries from github.com, so
#     in such sandboxes every method below can fail — that is fine; the
#     PreToolUse hook is a no-op when rtk is absent.
#
# Opt out: export RTK_INSTALL_DISABLE=1 (e.g. in CI or constrained sandboxes).

set -u

RTK_DIRS="$HOME/.local/bin $HOME/.cargo/bin /opt/homebrew/bin /usr/local/bin"

find_rtk() {
  command -v rtk 2>/dev/null && return 0
  for d in $RTK_DIRS; do
    if [ -x "$d/rtk" ]; then
      echo "$d/rtk"
      return 0
    fi
  done
  return 1
}

if [ "${RTK_INSTALL_DISABLE:-0}" = "1" ]; then
  exit 0
fi

if RTK_BIN=$(find_rtk); then
  # Sanity-check it's the real rtk (name-squatter binaries lack `gain`).
  if "$RTK_BIN" gain >/dev/null 2>&1 || "$RTK_BIN" --version 2>/dev/null | grep -q '^rtk '; then
    echo "[rtk] ready: $RTK_BIN"
    exit 0
  fi
fi

CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/rtk-bootstrap"
mkdir -p "$CACHE_DIR" 2>/dev/null || exit 0
LOCK_FILE="$CACHE_DIR/install.lock"
LOG_FILE="$CACHE_DIR/install.log"

# One attempt at a time; a lock older than 30 min is stale (crashed attempt).
if [ -f "$LOCK_FILE" ]; then
  if [ -n "$(find "$LOCK_FILE" -mmin -30 2>/dev/null)" ]; then
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi
touch "$LOCK_FILE"

# Detached so the hook returns immediately and the harness never waits on a
# compile. Method order: fastest/most-portable first. All failures are
# non-fatal by design.
(
  set +e
  trap 'rm -f "$LOCK_FILE"' EXIT
  {
    echo "=== rtk install attempt $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

    if command -v brew >/dev/null 2>&1; then
      echo "--- method: brew install rtk"
      brew install rtk && exit 0
    fi

    echo "--- method: official install.sh (raw.githubusercontent.com)"
    curl -fsSL --max-time 120 \
      "https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh" \
      | sh && exit 0

    if command -v cargo >/dev/null 2>&1; then
      # --git is mandatory: plain `cargo install rtk` grabs the wrong crate.
      echo "--- method: cargo install --git (source build)"
      cargo install --git https://github.com/rtk-ai/rtk --locked && exit 0
    fi

    echo "--- all methods failed (offline/sandboxed network is a normal cause)"
    exit 1
  } >>"$LOG_FILE" 2>&1
) >/dev/null 2>&1 &
disown 2>/dev/null || true

echo "[rtk] not found; background install started (log: $LOG_FILE)"
exit 0
