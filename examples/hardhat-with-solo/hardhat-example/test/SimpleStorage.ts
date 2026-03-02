// File: `test/SimpleStorage.ts`
import { expect } from "chai";
import { network } from "hardhat";

describe("SimpleStorage", function () {
  it("deploys with initial value", async function () {
    const { ethers } = await network.connect();
    const SimpleStorage = await ethers.getContractFactory("SimpleStorage");
    const instance = await SimpleStorage.deploy(42);
    await instance.waitForDeployment();

    const stored = await instance.get();
    expect(stored).to.equal(42);
  });

  it("updates value and emits ValueChanged event", async function () {
    const { ethers } = await network.connect();
    const [owner] = await ethers.getSigners();
    const SimpleStorage = await ethers.getContractFactory("SimpleStorage");
    const instance = await SimpleStorage.deploy(0);
    await instance.waitForDeployment();

    await expect(instance.set(7))
      .to.emit(instance, "ValueChanged")
      .withArgs(0, 7, owner.address);

    expect(await instance.get()).to.equal(7);
  });

  it("allows other accounts to set value", async function () {
    const { ethers } = await network.connect();
    const [, other] = await ethers.getSigners();
    const SimpleStorage = await ethers.getContractFactory("SimpleStorage");
    const instance = await SimpleStorage.deploy(1);
    await instance.waitForDeployment();

    const tx = await instance.connect(other).set(5);
    await tx.wait();

    expect(await instance.get()).to.equal(5);
  });
});
