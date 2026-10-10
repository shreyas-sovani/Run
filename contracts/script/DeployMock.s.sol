// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RunBank} from "../src/RunBank.sol";
import {MockAUSD} from "../src/MockAUSD.sol";
import {IRunBank} from "../src/IRunBank.sol";

/// @notice Fallback if real AUSD misbehaves: MockAUSD + a second RunBank on it, loaded, configured (level 0) and funded.
///         Writes app/src/config/deployment.testnet.mock.json (tokenKind "MOCK"). The app keeps using
///         deployment.testnet.json unless a human switches it.
///         forge script script/DeployMock.s.sol --rpc-url monad_testnet --broadcast --slow
contract DeployMock is Script {
    string internal constant OUT = "../app/src/config/deployment.testnet.mock.json";

    function run() external {
        require(block.chainid == 10143, "testnet only (chain 10143)");
        uint256 pk = vm.envUint("OPERATOR_PK");
        address operator = vm.addr(pk);
        address backup = vm.envAddress("BACKUP_ADDRESS");

        string memory ledgerJson = vm.readFile("../app/src/engine/data/ledger.json");
        uint256[] memory packed = vm.parseJsonUintArray(ledgerJson, ".packed");
        uint16 count = uint16(vm.parseJsonUint(ledgerJson, ".count"));
        string memory cfgJson = vm.readFile("../app/src/engine/data/configs.json");
        IRunBank.Config memory c = IRunBank.Config({
            cash0: uint64(vm.parseJsonUint(cfgJson, ".0.cash0")),
            bonds0: uint64(vm.parseJsonUint(cfgJson, ".0.bonds0")),
            speedBumpBps: uint16(vm.parseJsonUint(cfgJson, ".0.speedBumpBps")),
            insuredCap: uint64(vm.parseJsonUint(cfgJson, ".0.insuredCap")),
            haircutBaseBps: uint16(vm.parseJsonUint(cfgJson, ".0.haircutBaseBps")),
            haircutSlopeBps: uint16(vm.parseJsonUint(cfgJson, ".0.haircutSlopeBps")),
            haircutMaxBps: uint16(vm.parseJsonUint(cfgJson, ".0.haircutMaxBps")),
            quietTicks: uint16(vm.parseJsonUint(cfgJson, ".0.quietTicks"))
        });

        vm.startBroadcast(pk);
        MockAUSD token = new MockAUSD();
        RunBank bank = new RunBank(IERC20(address(token)), operator);
        bank.setOperator(backup, true);
        bank.loadLedger(packed, count);
        bank.setLevel(0, c);
        token.mint(address(bank), uint256(c.cash0) + c.bonds0);
        vm.stopBroadcast();

        string memory k = "mock";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "runBank", address(bank));
        vm.serializeAddress(k, "street", bank.street());
        vm.serializeAddress(k, "ausd", address(token));
        vm.serializeString(k, "deployBlock", vm.toString(block.number));
        vm.serializeString(k, "tokenKind", "MOCK");
        vm.serializeAddress(k, "operator", operator);
        string memory json = vm.serializeAddress(k, "backupOperator", backup);
        vm.writeJson(json, OUT);

        console2.log("MockAUSD", address(token));
        console2.log("RunBank ", address(bank));
    }
}
