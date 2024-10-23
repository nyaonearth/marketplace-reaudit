// SPDX-License-Identifier: UNLICENSED
/*

  Proxy registry; keeps a mapping of AuthenticatedProxy contracts and mapping of contracts authorized to access them.  
  
  Abstracted away from the Exchange (a) to reduce Exchange attack surface and (b) so that the Exchange contract can be upgraded without users needing to transfer assets to new proxies.

*/

pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./OwnableDelegateProxy.sol";

contract ProxyRegistry is Ownable {
    /* DelegateProxy implementation contract. Must be initialized. */
    address public delegateProxyImplementation;

    /* Authenticated proxies by user. */
    mapping(address => OwnableDelegateProxy) public proxies;

    /* Contracts allowed to call those proxies. */
    mapping(address => bool) public contracts;

    /* Contracts pending access. */
    mapping(address => uint) public pending;

    uint256 public DELAY_PERIOD = 86400;
    // events
    event StartGrantAuthen(address addr);
    event EndGrantAuthen(address addr);
    event RevokeAuthen(address addr);
    event ProxyRegistryUpdated(address proxy);

    constructor(address initialOwner) Ownable(initialOwner) {}
    /**
     * Start the process to enable access for specified contract. Subject to delay period.
     *
     * @dev ProxyRegistry owner only
     * @param addr Address to which to grant permissions
     */
    function startGrantAuthentication(address addr) public onlyOwner {
        require(
            !contracts[addr] && pending[addr] == 0,
            "Already pending or granted"
        );
        pending[addr] = block.timestamp;
        emit StartGrantAuthen(addr);
    }

    /**
     * End the process to nable access for specified contract after delay period has passed.
     *
     * @dev ProxyRegistry owner only
     * @param addr Address to which to grant permissions
     */
    function endGrantAuthentication(address addr) public onlyOwner {
        require(
            !contracts[addr] &&
                pending[addr] != 0 &&
                ((pending[addr] + DELAY_PERIOD) <= block.timestamp),
            "Delay period has not passed"
        );
        pending[addr] = 0;
        contracts[addr] = true;
        emit EndGrantAuthen(addr);
    }
    /**
     * Revoke access for specified contract. Can be done instantly.
     *
     * @dev ProxyRegistry owner only
     * @param addr Address of which to revoke permissions
     */
    function revokeAuthentication(address addr) public onlyOwner {
        contracts[addr] = false;
        emit RevokeAuthen(addr);
    }

    /**
     * Register a proxy contract with this registry
     *
     * @dev Must be called by the user which the proxy is for, creates a new AuthenticatedProxy
     */
    function registerProxy() public returns (OwnableDelegateProxy proxy) {
        require(
            address(proxies[msg.sender]) == address(0),
            "Proxy already exists"
        );
        proxy = new OwnableDelegateProxy(
            msg.sender,
            delegateProxyImplementation,
            abi.encodeWithSignature(
                "initialize(address,address)",
                msg.sender,
                address(this)
            )
        );
        proxies[msg.sender] = proxy;
        emit ProxyRegistryUpdated(address(proxy));
        return proxy;
    }
}
