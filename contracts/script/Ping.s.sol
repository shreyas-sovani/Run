// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {IRunBank} from "../src/IRunBank.sol";

contract Ping is Script {
    function run() external {
        require(block.chainid == 10143, "testnet only (chain 10143)");
        uint256 pk = vm.envUint("OPERATOR_PK");
        string memory dep = vm.readFile("../app/src/config/deployment.testnet.json");
        vm.startBroadcast(pk);
        IRunBank(vm.parseJsonAddress(dep, ".runBank")).ping();
        vm.stopBroadcast();
    }
}
