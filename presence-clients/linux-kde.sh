#!/usr/bin/env bash

set -u

presence_endpoint="${DOTT_PRESENCE_ENDPOINT:-https://somedott.space/api/presence}"
presence_token="${DOTT_PRESENCE_TOKEN:?Set DOTT_PRESENCE_TOKEN in the service environment}"
presence_interval="${DOTT_PRESENCE_INTERVAL:-60}"
presence_last_state=""

presence_detect_state() {
  local presence_locked=""
  local presence_idle_hint=""

  if command -v qdbus6 >/dev/null 2>&1; then
    presence_locked="$(qdbus6 org.freedesktop.ScreenSaver /ScreenSaver GetActive 2>/dev/null || true)"
  elif command -v qdbus >/dev/null 2>&1; then
    presence_locked="$(qdbus org.freedesktop.ScreenSaver /ScreenSaver GetActive 2>/dev/null || true)"
  fi

  presence_idle_hint="$(loginctl show-user "$(id -un)" -p IdleHint --value 2>/dev/null || true)"
  if [[ "$presence_locked" == "true" || "$presence_idle_hint" == "yes" ]]; then
    printf 'away'
  else
    printf 'online'
  fi
}

presence_send() {
  local presence_state="$1"
  curl --fail --silent --show-error \
    --connect-timeout 5 \
    --max-time 15 \
    --request POST \
    --header 'Accept: application/json' \
    --header "Authorization: Bearer ${presence_token}" \
    --header 'Content-Type: application/json' \
    --data "{\"state\":\"${presence_state}\"}" \
    "$presence_endpoint" >/dev/null
}

presence_shut_down() {
  trap - EXIT INT TERM
  presence_send offline || true
  exit 0
}

trap presence_shut_down EXIT INT TERM

while true; do
  presence_state="$(presence_detect_state)"
  if presence_send "$presence_state"; then
    if [[ "$presence_state" != "$presence_last_state" ]]; then
      printf 'Presence: %s\n' "$presence_state"
      presence_last_state="$presence_state"
    fi
  else
    printf 'Presence heartbeat failed; retrying in %s seconds.\n' "$presence_interval" >&2
  fi
  sleep "$presence_interval"
done
