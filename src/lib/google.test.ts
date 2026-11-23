import { describe, expect, it } from 'vitest';
import { diagnoseUrl, isConfigured } from './google';

describe('Google web-app URL check', () => {
  it('accepts a deployed Apps Script web-app URL', () => {
    const url = 'https://script.google.com/macros/s/AKfycbx123/exec';
    expect(diagnoseUrl(url)).toBeUndefined();
    expect(isConfigured({ url, token: 't', auto: true })).toBe(true);
  });

  it('explains when a Google Sheet link is pasted instead', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1_9aNjmE/edit?usp=sharing';
    expect(diagnoseUrl(url)).toMatch(/link to your Google Sheet/);
    expect(isConfigured({ url, token: 't', auto: true })).toBe(false);
  });

  it('explains the script editor link and the /dev test link', () => {
    expect(diagnoseUrl('https://script.google.com/home/projects/abc/edit')).toMatch(/editor link/);
    expect(diagnoseUrl('https://script.google.com/macros/s/AKfy/dev')).toMatch(/\/dev/);
  });
});
