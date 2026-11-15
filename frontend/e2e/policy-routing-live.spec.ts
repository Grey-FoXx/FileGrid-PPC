import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

test('Compose: save document -> Database in the real policy editor and retrieve encrypted upload', async ({ page }) => {
  test.skip(process.env['FILEGRID_POLICY_LIVE'] !== '1', 'Opt in to a temporary policy edit and synthetic upload');
  test.setTimeout(60000);
  const line = readFileSync('../.runtime/accounts.properties', 'utf8').split('\n').find(v => v.startsWith('admin='))!;
  const password = line.split('=')[1].split(':')[0];
  const headers = { Authorization: 'Basic ' + Buffer.from('admin:' + password).toString('base64') };
  const original = await (await page.request.get('/api/v1/policies', { headers })).json();
  let savedVersion = original.version;
  try {
    await page.goto('/');
    await page.getByLabel('Utilizator').fill('admin');
    await page.getByLabel('Parolă', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Intră în platformă' }).click();
    await page.locator('nav button').filter({ hasText: 'Politici de stocare' }).click();
    await page.locator('.category-card').filter({ hasText: 'CONNECTION_DOCUMENT' }).getByRole('button', { name: 'Configurează politica' }).click();
    const dialog = page.getByRole('dialog', { name: 'Configurează politica' });
    await dialog.getByLabel('Destinație').selectOption('DATABASE');
    await dialog.getByRole('button', { name: 'Aplică politica' }).click();
    await expect(dialog.getByRole('status')).toContainText('este activă');
    const saved = await (await page.request.get('/api/v1/policies', { headers })).json();
    savedVersion = saved.version;
    expect(saved.version).toBe(original.version + 1);
    expect(saved.rules.find((r: { category: string }) => r.category === 'CONNECTION_DOCUMENT').storage).toBe('DATABASE');
    const data = Buffer.from('SYNTHETIC BROWSER POLICY PRIVATE DOCUMENT\n');
    const created = await page.request.post('/api/v1/upload-sessions', { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: {
      category: 'CONNECTION_DOCUMENT', applicationId: 'SYNTHETIC-UI-POLICY', filename: 'synthetic-ui-policy.txt',
      contentType: 'text/plain', sizeBytes: data.length, sha256: createHash('sha256').update(data).digest('hex'),
    } });
    expect(created.status()).toBe(201);
    const session = await created.json();
    expect((await page.request.put(`/api/v1/upload-sessions/${session.sessionId}/content`, { headers, data })).ok()).toBe(true);
    expect((await page.request.post(`/api/v1/upload-sessions/${session.sessionId}/complete`, { headers })).status()).toBe(202);
    await expect.poll(async () => (await (await page.request.get(`/api/v1/files/${session.fileId}`, { headers })).json()).status).toBe('AVAILABLE');
    const file = await (await page.request.get(`/api/v1/files/${session.fileId}`, { headers })).json();
    expect(file.storage).toBe('DATABASE');
    expect(file.policyVersion).toBe(String(savedVersion));
    const download = await page.request.get(`/api/v1/files/${session.fileId}/content`, { headers });
    expect(download.ok()).toBe(true);
    expect((await download.body()).equals(data)).toBe(true);
    await page.screenshot({ path: '../.runtime/policy-document-database-live.png', fullPage: true });
  } finally {
    const restored = await page.request.put('/api/v1/policies', { headers, data: { expectedVersion: savedVersion, rules: original.rules } });
    expect(restored.ok(), 'Restore original rules without overwriting concurrent edits').toBe(true);
  }
});
