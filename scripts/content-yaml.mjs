import { parse, stringify } from 'yaml';

export function parseYaml(source, label = 'YAML') {
  try {
    return parse(source);
  } catch (error) {
    throw new Error(`Could not parse ${label}: ${error.message}`);
  }
}

export function stringifyYaml(value) {
  return stringify(value, {
    lineWidth: 0,
    minContentWidth: 0,
  });
}
