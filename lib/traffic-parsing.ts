function textOnly(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

export function popupFields(html: string): Record<string, string> {
  const fields = [...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
  return Object.fromEntries(fields.map(match => [textOnly(match[1]), textOnly(match[2])]));
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(field);
      field = '';
      if (row.some(cell => cell.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some(cell => cell.trim() !== '')) rows.push(row);
  return rows;
}

export function inHongKong(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 22 && lat <= 23 && lng >= 113 && lng <= 115;
}

export function pickLatestPeriod<T extends { period_to?: string }>(period: T | T[] | undefined): T | undefined {
  const periods = Array.isArray(period) ? period : period ? [period] : [];
  return periods.reduce<T | undefined>((latest, current) => {
    if (!latest) return current;
    if (!current.period_to) return latest;
    return !latest.period_to || current.period_to > latest.period_to ? current : latest;
  }, undefined);
}

export function roundCoordinate(value: number): number {
  return Math.round(value * 100000) / 100000;
}

export function isUnnamedRoad(name: string | undefined): boolean {
  const trimmed = name?.trim();
  return !trimmed || trimmed === '-99' || trimmed === '－９９';
}

export function parseSegmentRouteNumbers(text: string): Map<number, number> {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const header = rows.shift()?.map(cell => cell.trim().toLowerCase()) ?? [];
  const idIndex = header.indexOf('irn_id');
  const routeIndex = header.indexOf('ucase(route)');
  const routeNumbers = new Map<number, number>();
  if (idIndex < 0 || routeIndex < 0) return routeNumbers;

  for (const row of rows) {
    const routeId = Number(row[idIndex]);
    const routeNumber = Number(row[routeIndex]);
    if (Number.isInteger(routeId) && routeId > 0 && Number.isFinite(routeNumber) && routeNumber > 0) {
      routeNumbers.set(routeId, routeNumber);
    }
  }
  return routeNumbers;
}
