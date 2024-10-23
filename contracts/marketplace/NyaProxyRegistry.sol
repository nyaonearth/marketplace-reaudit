// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import "./registry/ProxyRegistry.sol";
import "./registry/AuthenticatedProxy.sol";

/**
 * @title NyaProxyRegistry
 * @author Nya team Developers
 */
contract NyaProxyRegistry is ProxyRegistry {
    constructor(address initialOwner) ProxyRegistry(initialOwner) {
        delegateProxyImplementation = address(new AuthenticatedProxy());
    }

    string public constant name = "Nya Proxy Registry";

    /* Whether the initial auth address has been set. */
    bool public initialAddressSet = false;

    /** 
     * Grant authentication to the initial Exchange protocol contract
     *
     * @dev No delay, can only be called once - after that the standard registry process with a delay must be used
     * @param authAddress Address of the contract to grant authentication
     */
    function grantInitialAuthentication (address authAddress)
        onlyOwner
        public
    {
        require(!initialAddressSet);
        initialAddressSet = true;
        contracts[authAddress] = true;
    }

}
