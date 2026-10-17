describe("highlight-selected initialization cleanup", () => {
  let pack;

  beforeEach(async () => {
    if (lumine.packages.isPackageLoaded("highlight-selected"))
      await lumine.packages.unloadPackage("highlight-selected", { serialize: false });
    pack = lumine.packages.loadPackage("highlight-selected");
    pack.initializeForExternalUse("workspace restoration");
  });

  afterEach(async () => {
    if (lumine.packages.isPackageLoaded("highlight-selected"))
      await lumine.packages.unloadPackage("highlight-selected", { serialize: false });
  });

  it("deactivates before activation and can activate again", async () => {
    const scope = pack.lifecycleContext.subscriptions;
    expect(pack.mainActivationStarted).toBe(false);
    await expectAsync(pack.deactivate()).toBeResolved();
    expect(scope.disposed).toBe(true);
    pack = await lumine.packages.activatePackage("highlight-selected");
    expect(pack.mainActivated).toBe(true);
    expect(pack.lifecycleContext.subscriptions).not.toBe(scope);
  });

  it("unloads before activation starts", async () => {
    expect(pack.mainInitialized).toBe(true);
    expect(pack.mainActivationStarted).toBe(false);
    await expectAsync(
      lumine.packages.unloadPackage("highlight-selected", { serialize: false }),
    ).toBeResolved();
    expect(lumine.packages.isPackageLoaded("highlight-selected")).toBe(false);
  });
});
