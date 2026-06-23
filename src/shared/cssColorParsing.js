import { clamp01 } from './colorParsing.js';

function clampChannel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(255, number));
}

function parseAlpha(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = String(value).trim();
  const parsed = raw.endsWith('%')
    ? Number.parseFloat(raw) / 100
    : Number.parseFloat(raw);
  return clamp01(parsed);
}

function parseRgbChannel(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = raw.endsWith('%')
    ? (Number.parseFloat(raw) / 100) * 255
    : Number.parseFloat(raw);
  return clampChannel(parsed);
}

function parseHexColor(raw) {
  let hex = raw.slice(1);
  if (![3, 4, 6, 8].includes(hex.length) || !/^[\da-f]+$/i.test(hex)) return null;
  if (hex.length === 3 || hex.length === 4) {
    hex = hex.split('').map(char => char + char).join('');
  }
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a: clamp01(a) };
}

function getFunctionBody(raw, names) {
  const match = raw.match(/^([a-z-]+)\((.*)\)$/i);
  if (!match || !names.includes(match[1].toLowerCase())) return null;
  return match[2].trim();
}

function parseRgbFunction(raw) {
  const body = getFunctionBody(raw, ['rgb', 'rgba']);
  if (!body) return null;
  const alphaSplit = body.split('/');
  const colorPart = alphaSplit[0].trim();
  const alphaPart = alphaSplit[1]?.trim();
  const components = colorPart.includes(',')
    ? colorPart.split(',').map(part => part.trim())
    : colorPart.split(/\s+/).filter(Boolean);
  if (components.length < 3) return null;
  const r = parseRgbChannel(components[0]);
  const g = parseRgbChannel(components[1]);
  const b = parseRgbChannel(components[2]);
  if ([r, g, b].some(value => value === null)) return null;
  const a = parseAlpha(alphaPart ?? components[3], 1);
  return { r, g, b, a };
}

function parseColorFunction(raw) {
  const body = getFunctionBody(raw, ['color']);
  if (!body) return null;
  const alphaSplit = body.split('/');
  const [space, ...channels] = alphaSplit[0].trim().split(/\s+/).filter(Boolean);
  if (!space || channels.length < 3) return null;
  const normalizedSpace = space.toLowerCase();
  if (!['srgb', 'display-p3'].includes(normalizedSpace)) return null;
  const parsedChannels = channels.slice(0, 3).map(channel => clampChannel(Number.parseFloat(channel) * 255));
  if (parsedChannels.some(value => value === null)) return null;
  return {
    r: parsedChannels[0],
    g: parsedChannels[1],
    b: parsedChannels[2],
    a: parseAlpha(alphaSplit[1]?.trim(), 1)
  };
}

export function parseCssColorToRgba(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.toLowerCase() === 'transparent') return null;
  if (raw.startsWith('#')) return parseHexColor(raw);
  return parseRgbFunction(raw) || parseColorFunction(raw);
}
