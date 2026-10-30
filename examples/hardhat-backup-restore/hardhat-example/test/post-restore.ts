// Runs after the restore: the contract deployed before the backup must still exist
// with its stored value, and the restored network must accept new transactions.
import { expect } from "chai";
import { network } from "hardhat";
import { readFileSync } from "node:fs";

describe("post-restore", function () {
  it("finds the contract deployed before the backup with its stored value", async function () {
    const { ethers } = await network.connect();
    const address = readFileSync(".deployed-address", "utf8").trim();
    const instance = await ethers.getContractAt("SimpleStorage", address);
    expect(await instance.get()).to.equal(7);
  });

  it("accepts new transactions on the restored network", async function () {
    const { ethers } = await network.connect();
    const address = readFileSync(".deployed-address", "utf8").trim();
    const instance = await ethers.getContractAt("SimpleStorage", address);
    await (await instance.set(9)).wait();
    expect(await instance.get()).to.equal(9);
  });
});
