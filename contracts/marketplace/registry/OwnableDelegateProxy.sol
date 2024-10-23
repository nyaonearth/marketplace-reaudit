// SPDX-License-Identifier: UNLICENSED
/*

  WyvernOwnableDelegateProxy

*/

pragma solidity 0.8.20;

import "./ProxyRegistry.sol";
import "./AuthenticatedProxy.sol";
import "./proxy/OwnedUpgradeabilityProxy.sol";

contract OwnableDelegateProxy is OwnedUpgradeabilityProxy {
    constructor(
        address owner,
        address initialImplementation,
        bytes memory _calldata
    ) {
        setUpgradeabilityOwner(owner);
        _upgradeTo(initialImplementation);
        (bool success, ) = initialImplementation.delegatecall(_calldata);
        require(success, "implementation delegatecall failed");
    }

}
