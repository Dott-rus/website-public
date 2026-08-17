#!/usr/bin/env bash

set -u

presence_config_home="${XDG_CONFIG_HOME:-${HOME}/.config}"
presence_environment_file="${DOTT_PRESENCE_ENV_FILE:-${presence_config_home}/dott-presence.env}"
if [[ -f "$presence_environment_file" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$presence_environment_file"
  set +a
fi

presence_endpoint="${DOTT_PRESENCE_ENDPOINT:-https://somedott.space/api/presence}"
presence_action="${1:-}"
presence_value="${2:-}"

presence_post() {
  local presence_url="$1"
  local presence_token="$2"
  local presence_body="$3"
  curl --fail --silent --show-error \
    --connect-timeout 5 \
    --max-time 15 \
    --request POST \
    --header 'Accept: application/json' \
    --header "Authorization: Bearer ${presence_token}" \
    --header 'Content-Type: application/json' \
    --data "$presence_body" \
    "$presence_url"
  printf '\n'
}

case "$presence_action" in
  invisible)
    [[ "$presence_value" == "on" || "$presence_value" == "off" ]] || {
      printf 'Usage: %s invisible on|off\n' "$0" >&2
      exit 2
    }
    presence_post \
      "${presence_endpoint}/settings" \
      "${DOTT_PRESENCE_ADMIN_TOKEN:?Set DOTT_PRESENCE_ADMIN_TOKEN}" \
      "{\"invisible\":$([[ "$presence_value" == "on" ]] && printf true || printf false)}"
    ;;
  device)
    [[ "$presence_value" == "on" || "$presence_value" == "off" ]] || {
      printf 'Usage: %s device on|off\n' "$0" >&2
      exit 2
    }
    presence_post \
      "${presence_endpoint}/settings" \
      "${DOTT_PRESENCE_ADMIN_TOKEN:?Set DOTT_PRESENCE_ADMIN_TOKEN}" \
      "{\"showDevice\":$([[ "$presence_value" == "on" ]] && printf true || printf false)}"
    ;;
  status)
    [[ "$presence_value" == "online" || "$presence_value" == "away" || "$presence_value" == "offline" ]] || {
      printf 'Usage: %s status online|away|offline\n' "$0" >&2
      exit 2
    }
    presence_post \
      "$presence_endpoint" \
      "${DOTT_PRESENCE_TOKEN:?Set DOTT_PRESENCE_TOKEN}" \
      "{\"state\":\"${presence_value}\"}"
    ;;
  *)
    printf 'Usage: %s invisible on|off | device on|off | status online|away|offline\n' "$0" >&2
    exit 2
    ;;
esac
