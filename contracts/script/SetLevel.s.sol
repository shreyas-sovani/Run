// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IRunBank} from "../src/IRunBank.sol";

/// @notice Sets a level from B's configs.json. `LEVEL` env var (default 0). Bank must be Ready.
contract SetLevel is Script {
    function run() external {
        require(block.chainid == 10143, "testnet only (chain 10143)");
        uint256 pk = vm.envUint("OPERATOR_PK");
        uint8 level = uint8(vm.envOr("LEVEL", uint256(0)));
        IRunBank bank = IRunBank(vm.parseJsonAddress(vm.readFile("../app/src/config/deployment.testnet.json"), ".runBank"));

        string memory json = vm.readFile("../app/src/engine/data/configs.json");
        string memory p = string.concat(".", vm.toString(level), ".");
        IRunBank.Config memory c = IRunBank.Config({
            cash0: uint64(vm.parseJsonUint(json, string.concat(p, "cash0"))),
            bonds0: uint64(vm.parseJsonUint(json, string.concat(p, "bonds0"))),
            speedBumpBps: uint16(vm.parseJsonUint(json, string.concat(p, "speedBumpBps"))),
            insuredCap: uint64(vm.parseJsonUint(json, string.concat(p, "insuredCap"))),
            haircutBaseBps: uint16(vm.parseJsonUint(json, string.concat(p, "haircutBaseBps"))),
            haircutSlopeBps: uint16(vm.parseJsonUint(json, string.concat(p, "haircutSlopeBps"))),
            haircutMaxBps: uint16(vm.parseJsonUint(json, string.concat(p, "haircutMaxBps"))),
            quietTicks: uint16(vm.parseJsonUint(json, string.concat(p, "quietTicks")))
        });

        vm.startBroadcast(pk);
        bank.setLevel(level, c);
        vm.stopBroadcast();

        require(bank.snapshot().configHash == keccak256(abi.encode(c)), "onchain configHash mismatch");
        console2.log("level set", level);
    }
}
