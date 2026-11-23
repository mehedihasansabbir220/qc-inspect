import { describe, expect, it } from 'vitest';
import { buildSetupScript, diagnoseUrl, isConfigured, newToken, sheetIdFrom } from './google';

describe('Google web-app URL check', () => {
  it('accepts a deployed Apps Script web-app URL', () => {
    const url = 'https://script.google.com/macros/s/AKfycbx123/exec';
    expect(diagnoseUrl(url)).toBeUndefined();
    expect(isConfigured({ url, token: 't', auto: true })).toBe(true);
  });

  it('explains when a Google Sheet link is pasted instead', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1_9aNjmE/edit?usp=sharing';
    expect(diagnoseUrl(url)).toMatch(/your Sheet link/);
    expect(isConfigured({ url, token: 't', auto: true })).toBe(false);
  });

  it('explains the script editor link and the /dev test link', () => {
    expect(diagnoseUrl('https://script.google.com/home/projects/abc/edit')).toMatch(/editor link/);
    expect(diagnoseUrl('https://script.google.com/macros/s/AKfy/dev')).toMatch(/\/dev/);
  });

  it('builds a ready-to-paste script with the token and the user\'s Sheet inside', () => {
    const code = buildSetupScript('qc_secret', 'https://docs.google.com/spreadsheets/d/1_9aNjmEuu8TT0dLPI-7ybKgPiOQEG3W4WlKFbKMyh9A/edit?usp=sharing');
    expect(code).toContain("const TOKEN = 'qc_secret';");
    expect(code).toContain("const SHEET_ID = '1_9aNjmEuu8TT0dLPI-7ybKgPiOQEG3W4WlKFbKMyh9A';");
    expect(code).toContain('function doPost');
  });

  it('leaves the Sheet empty when none is given, and makes unique tokens', () => {
    expect(buildSetupScript('t')).toContain("const SHEET_ID = '';");
    expect(newToken()).not.toBe(newToken());
    expect(sheetIdFrom('https://example.com')).toBeUndefined();
  });
});
