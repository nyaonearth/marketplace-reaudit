// SPDX-License-Identifier: UNLICENSED
/* 

  Proxy contract to hold access to assets on behalf of a user (e.g. ERC20 approve) and execute calls under particular conditions.

*/

pragma solidity 0.8.20;

import "./ProxyRegistry.sol";
import "../libraries/TokenRecipient.sol";
import "./proxy/OwnedUpgradeabilityStorage.sol";

/**
 * @title AuthenticatedProxy
 */
contract AuthenticatedProxy is TokenRecipient, OwnedUpgradeabilityStorage {

    /* Whether initialized. */
    bool initialized;

    /* Address which owns this proxy. */
    address public user;

    /* Associated registry with contract authentication information. */
    ProxyRegistry public registry;

    /* Whether access has been revoked. */
    bool public revoked;

    /* Delegate call could be used to atomically transfer multiple assets owned by the proxy contract with one order. */
    enum HowToCall { Call, DelegateCall }

    /* Event fired when the proxy access is revoked or unrevoked. */
    event Revoked(bool revoked);

    /**
     * Initialize an AuthenticatedProxy
     *
     * @param addrUser Address of user on whose behalf this proxy will act
     * @param addrRegistry Address of ProxyRegistry contract which will manage this proxy
     */
    function initialize (address addrUser, ProxyRegistry addrRegistry)
        public
    {
        require(!initialized, "Already initialized");
        initialized = true;
        user = addrUser;
        registry = addrRegistry;
    }

    /**
     * Set the revoked flag (allows a user to revoke ProxyRegistry access)
     *
     * @dev Can be called by the user only
     * @param revoke Whether or not to revoke access
     */
    function setRevoke(bool revoke)
        public
    {
        require(msg.sender == user, "Not user");
        revoked = revoke;
        emit Revoked(revoke);
    }

    /**
     * Execute a message call from the proxy contract
     *
     * @dev Can be called by the user, or by a contract authorized by the registry as long as the user has not revoked access
     * @param dest Address to which the call will be sent
     * @param howToCall Which kind of call to make
     * @param _calldata Calldata to send
     * @return result of the call (success or failure)
     */
    function proxy(address dest, HowToCall howToCall, bytes memory _calldata)
        public
        returns (bool result)
    {
        require(msg.sender == user || (!revoked && registry.contracts(msg.sender)), "Not authorized");
        if (howToCall == HowToCall.Call) {
            (result,) = dest.call(_calldata);
        } else if (howToCall == HowToCall.DelegateCall) {
            (result,) = dest.delegatecall(_calldata);
        }
        return result;
    }

    /**
     * Execute a message call and assert success
     * 
     * @dev Same functionality as `proxy`, just asserts the return value
     * @param dest Address to which the call will be sent
     * @param howToCall What kind of call to make
     * @param _calldata Calldata to send
     */
    function proxyAssert(address dest, HowToCall howToCall, bytes memory _calldata)
        public
    {
        require(proxy(dest, howToCall, _calldata), "Unsuccessful call");
    }

}
