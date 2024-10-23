// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import './Proxy.sol';
import './OwnedUpgradeabilityStorage.sol';

/**
 * @title OwnedUpgradeabilityProxy
 * @dev This contract combines an upgradeability proxy with basic authorization control functionalities
 */
contract OwnedUpgradeabilityProxy is Proxy, OwnedUpgradeabilityStorage {
    /**
     * @dev Returns the current implementation address.
     * @return Address of the current implementation
     */
    function implementation() public view override(OwnedUpgradeabilityStorage, Proxy) returns (address) {
        return _implementation;
    }

    /**
     * @dev Returns the proxy type (EIP 897).
     * @return Proxy type, 2 for upgradeable proxy
     */
    function proxyType() public pure override(OwnedUpgradeabilityStorage, Proxy) returns (uint256) {
        return 2;
    }

    /**
     * @dev Receive function to accept ether transfers.
     */
    receive() external payable override {}
  /**
  * @dev Event to show ownership has been transferred
  * @param previousOwner representing the address of the previous owner
  * @param newOwner representing the address of the new owner
  */
  event ProxyOwnershipTransferred(address previousOwner, address newOwner);

  /**
  * @dev This event will be emitted every time the implementation gets upgraded
  * @param implementation representing the address of the upgraded implementation
  */
  event Upgraded(address indexed implementation);

  /**
  * @dev Upgrades the implementation address
  * @param implementation_ representing the address of the new implementation to be set
  */
  function _upgradeTo(address implementation_) internal {
    require(_implementation != implementation_, "Proxy already uses this implementation");
    _implementation = implementation_;
    emit Upgraded(implementation_);
  }

  /**
  * @dev Throws if called by any account other than the owner.
  */
  modifier onlyProxyOwner() {
    require(msg.sender == proxyOwner(), "Only the proxy owner can call this function");
    _;
  }

  /**
   * @dev Tells the address of the proxy owner
   * @return the address of the proxy owner
   */
  function proxyOwner() public view returns (address) {
    return upgradeabilityOwner();
  }

  /**
   * @dev Allows the current owner to transfer control of the contract to a newOwner.
   * @param newOwner The address to transfer ownership to.
   */
  function transferProxyOwnership(address newOwner) public onlyProxyOwner {
    require(newOwner != address(0), "New owner cannot be the zero address");
    emit ProxyOwnershipTransferred(proxyOwner(), newOwner);
    setUpgradeabilityOwner(newOwner);
  }

  /**
   * @dev Allows the upgradeability owner to upgrade the current implementation of the proxy.
   * @param implementation representing the address of the new implementation to be set.
   */
  function upgradeTo(address implementation) public onlyProxyOwner {
    _upgradeTo(implementation);
  }

  /**
   * @dev Allows the upgradeability owner to upgrade the current implementation of the proxy
   * and delegatecall the new implementation for initialization.
   * @param implementation representing the address of the new implementation to be set.
   * @param data represents the msg.data to bet sent in the low level call. This parameter may include the function
   * signature of the implementation to be called with the needed payload
   */
  function upgradeToAndCall(address implementation, bytes memory data) payable public onlyProxyOwner {
    upgradeTo(implementation);
    (bool success, ) = address(this).delegatecall(data);
    require(success, "Delegatecall failed");
  }
}
