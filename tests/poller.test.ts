describe('poller module stub', () => {
  test('module loads as empty object export', async () => {
    const mod = await import('../src/poller');
    expect(mod).toEqual({});
  });
});
