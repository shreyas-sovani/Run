// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IRunBank} from "../src/IRunBank.sol";

/// @notice Loads B's ledger (app/src/engine/data/ledger.json) into the bank. Allowed while Ready; re-run after B regenerates it.
contract LoadLedger is Script {
    function run() external {
        require(block.chainid == 10143, "testnet only (chain 10143)");
        uint256 pk = vm.envUint("OPERATOR_PK");
        IRunBank bank = IRunBank(vm.parseJsonAddress(vm.readFile("../app/src/config/deployment.testnet.json"), ".runBank"));

        string memory json = vm.readFile("../app/src/engine/data/ledger.json");
        uint256[] memory packed = vm.parseJsonUintArray(json, ".packed");
        uint16 count = uint16(vm.parseJsonUint(json, ".count"));
        bytes32 expected = vm.parseJsonBytes32(json, ".ledgerHash");
        require(keccak256(abi.encodePacked(packed)) == expected, "ledger.json: packed does not hash to ledgerHash");

        vm.startBroadcast(pk);
        bank.loadLedger(packed, count);
        vm.stopBroadcast();

        require(bank.snapshot().ledgerHash == expected, "onchain ledgerHash mismatch");
        console2.log("ledger loaded, count", count);
    }
}
