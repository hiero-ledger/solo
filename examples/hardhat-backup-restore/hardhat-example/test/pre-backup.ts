// Runs before the backup: writes state to the ledger that must survive a restore.
import { expect } from "chai";
import { network } from "hardhat";
import { writeFileSync } from "node:fs";

describe("pre-backup", function () {
  it("deploys SimpleStorage, stores a value and records the contract address", async function () {
    const { ethers } = await network.connect();
    const SimpleStorage = await ethers.getContractFactory("SimpleStorage");
    const instance = await SimpleStorage.deploy(42);
    await instance.waitForDeployment();

    await (await instance.set(7)).wait();
    expect(await instance.get()).to.equal(7);

    writeFileSync(".deployed-address", await instance.getAddress());
  });
});
