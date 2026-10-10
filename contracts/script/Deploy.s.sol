// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RunBank} from "../src/RunBank.sol";
import {Street} from "../src/Street.sol";

/// @notice Deploys RunBank (which creates Street), then adds the backup operator.
///         forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --slow
///         Reads OPERATOR_PK and BACKUP_ADDRESS from contracts/.env. The key is never printed.
///         Run script/deploy.sh to also fix up `deployBlock` in the deployment JSON from the receipt.
contract Deploy is Script {
    address internal constant AUSD = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
    string internal constant OUT = "../app/src/config/deployment.testnet.json";

    function run() external {
        require(block.chainid == 10143, "testnet only (chain 10143)");
        uint256 pk = vm.envUint("OPERATOR_PK");
        address operator = vm.addr(pk);
        address backup = vm.envAddress("BACKUP_ADDRESS");

        vm.startBroadcast(pk);
        RunBank bank = new RunBank(IERC20(AUSD), operator);
        bank.setOperator(backup, true);
        vm.stopBroadcast();

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "runBank", address(bank));
        vm.serializeAddress(k, "street", bank.street());
        vm.serializeAddress(k, "ausd", AUSD);
        vm.serializeString(k, "deployBlock", vm.toString(block.number)); // refined by deploy.sh from the receipt
        vm.serializeString(k, "tokenKind", "AUSD");
        vm.serializeAddress(k, "operator", operator);
        string memory json = vm.serializeAddress(k, "backupOperator", backup);
        vm.writeJson(json, OUT);

        console2.log("RunBank", address(bank));
        console2.log("Street ", bank.street());
    }
}
