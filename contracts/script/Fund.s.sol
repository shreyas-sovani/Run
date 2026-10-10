// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IRunBank} from "../src/IRunBank.sol";

/// @notice Tops the bank up to `cash + bonds` AUSD (the balance sheet it was configured with) from the operator.
contract Fund is Script {
    function run() external {
        require(block.chainid == 10143, "testnet only (chain 10143)");
        uint256 pk = vm.envUint("OPERATOR_PK");
        string memory dep = vm.readFile("../app/src/config/deployment.testnet.json");
        IRunBank bank = IRunBank(vm.parseJsonAddress(dep, ".runBank"));
        IERC20 ausd = IERC20(vm.parseJsonAddress(dep, ".ausd"));

        IRunBank.Snapshot memory s = bank.snapshot();
        require(s.status == IRunBank.Status.Ready, "bank not Ready");
        uint256 target = uint256(s.cash) + s.bonds;
        uint256 have = ausd.balanceOf(address(bank));
        console2.log("target", target);
        console2.log("have  ", have);
        if (have >= target) return;

        vm.startBroadcast(pk);
        require(ausd.transfer(address(bank), target - have), "transfer failed");
        vm.stopBroadcast();
    }
}
