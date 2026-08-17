export const presenceActiveWindowMs = 150_000;

export const presenceDevices = Object.freeze([
  { id: 'phone', label: 'Phone', tokenName: 'PRESENCE_PHONE_TOKEN' },
  { id: 'pc', label: 'PC', tokenName: 'PRESENCE_PC_TOKEN' },
  { id: 'player', label: 'Player', tokenName: 'PRESENCE_PLAYER_TOKEN' },
]);

export const defaultPresenceSettings = Object.freeze({
  invisible: false,
  showDevice: true,
});

const publicStates = new Set(['online', 'away', 'offline']);

export function isPresenceState(value) {
  return publicStates.has(value);
}

export function normalizePresenceSettings(value) {
  return {
    invisible: value?.invisible === true,
    showDevice: value?.showDevice !== false,
  };
}

function validRecord(record) {
  return record
    && presenceDevices.some((device) => device.id === record.device)
    && isPresenceState(record.state)
    && typeof record.updatedAt === 'string'
    && !Number.isNaN(Date.parse(record.updatedAt));
}

export function aggregatePresence(records, settings, now = Date.now()) {
  const normalizedSettings = normalizePresenceSettings(settings);
  if (normalizedSettings.invisible) {
    return { status: 'offline', device: null, lastSeen: null };
  }

  const validRecords = records
    .filter(validRecord)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const latest = validRecords[0];
  if (!latest) return { status: 'offline', device: null, lastSeen: null };

  const active = validRecords.find((record) =>
    record.state !== 'offline'
    && Math.max(0, now - Date.parse(record.updatedAt)) <= presenceActiveWindowMs);
  const visibleRecord = active || latest;
  const definition = presenceDevices.find((device) => device.id === visibleRecord.device);
  const device = normalizedSettings.showDevice ? definition.label : null;

  if (active) {
    return { status: active.state, device, lastSeen: active.updatedAt };
  }

  return { status: 'offline', device, lastSeen: latest.updatedAt };
}

export async function readPresence(kv, now = Date.now()) {
  const [settingsValue, ...deviceValues] = await Promise.all([
    kv.get('presence:settings', { type: 'json' }),
    ...presenceDevices.map((device) => kv.get(`presence:device:${device.id}`, { type: 'json' })),
  ]);
  return aggregatePresence(deviceValues, settingsValue, now);
}
