// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IRunBank} from "../src/IRunBank.sol";

/// @notice Operator lifecycle helper for rehearsals and gas calibration.
///   ACTION=start  [CARD=0 SEED_NODE=0 MODEL_SEED=1]   startRumor (bank must be Ready)
///   ACTION=seal   FIRST_TICK FROM COUNT [TICKS=1]     one sealTicks tx, TICKS ticks of COUNT consecutive ids from FROM
///   ACTION=reset                                      reset (any status except Ready)
///   forge script script/Lifecycle.s.sol --rpc-url monad_testnet --broadcast --slow
contract Lifecycle is Script {
    function run() external {
        require(block.chainid == 10143, "testnet only (chain 10143)");
        uint256 pk = vm.envUint("OPERATOR_PK");
        IRunBank bank = IRunBank(vm.parseJsonAddress(vm.readFile("../app/src/config/deployment.testnet.json"), ".runBank"));
        bytes32 action = keccak256(bytes(vm.envString("ACTION")));

        vm.startBroadcast(pk);
        if (action == keccak256("start")) {
            bank.startRumor(
                uint8(vm.envOr("CARD", uint256(0))),
                uint16(vm.envOr("SEED_NODE", uint256(0))),
                uint64(vm.envOr("MODEL_SEED", uint256(1))),
                bytes32(0)
            );
        } else if (action == keccak256("seal")) {
            uint256 from = vm.envUint("FROM");
            uint256 count = vm.envUint("COUNT");
            uint256 nTicks = vm.envOr("TICKS", uint256(1));
            uint16[][] memory ticks = new uint16[][](nTicks);
            for (uint256 t; t < nTicks; ++t) {
                ticks[t] = new uint16[](count);
                for (uint256 i; i < count; ++i) {
                    ticks[t][i] = uint16(from + t * count + i);
                }
            }
            (uint32 last, IRunBank.Status st) = bank.sealTicks(uint32(vm.envUint("FIRST_TICK")), ticks);
            console2.log("lastTick", last);
            console2.log("status", uint8(st));
        } else if (action == keccak256("reset")) {
            bank.reset();
        } else {
            revert("ACTION must be start | seal | reset");
        }
        vm.stopBroadcast();
    }
}
