// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.21;

import {Test} from "forge-std/Test.sol";
import {SimpleStorage} from "../contracts/SimpleStorage.sol";

/// Runs against a fork of the Solo JSON-RPC relay (`eth_rpc_url` in foundry.toml). Contracts created here
/// and every state change live only in the local fork; the Solo network itself is never modified.
contract SimpleStorageTest is Test {
    uint256 private constant SOLO_CHAIN_ID = 298;

    function test_ForksTheSoloRelay() public view {
        assertEq(block.chainid, SOLO_CHAIN_ID, "forge test must fork the Solo relay; check eth_rpc_url");
    }

    function test_DeploysWithInitialValue() public {
        SimpleStorage instance = new SimpleStorage(42);

        assertEq(instance.get(), 42);
    }

    function test_UpdatesValueAndEmitsValueChanged() public {
        SimpleStorage instance = new SimpleStorage(0);

        vm.expectEmit(address(instance));
        emit SimpleStorage.ValueChanged(0, 7, address(this));
        instance.set(7);

        assertEq(instance.get(), 7);
    }

    function test_AllowsOtherAccountsToSetValue() public {
        SimpleStorage instance = new SimpleStorage(1);
        address other = makeAddr("other");

        vm.prank(other);
        instance.set(5);

        assertEq(instance.get(), 5);
    }

    /// Reads the SimpleStorage instance that `task test` deployed to Solo with `forge create` and updated with
    /// `cast send`. Skipped when SIMPLE_STORAGE_ADDRESS is not set.
    function test_ReadsContractDeployedToSolo() public {
        address deployed = vm.envOr("SIMPLE_STORAGE_ADDRESS", address(0));
        vm.skip(deployed == address(0));
        SimpleStorage instance = SimpleStorage(deployed);

        assertEq(instance.get(), vm.envUint("SIMPLE_STORAGE_VALUE"));

        vm.prank(makeAddr("other"));
        instance.set(99);

        assertEq(instance.get(), 99);
    }
}
