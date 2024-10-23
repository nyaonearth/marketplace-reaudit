// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

/**
 * @title Proxy
 * @dev Gives the possibility to delegate any call to a foreign implementation.
 */
abstract contract Proxy {

  /**
  * @dev Tells the address of the implementation where every call will be delegated.
  */
  function implementation() public view virtual returns (address);

  /**
  * @dev Tells the type of proxy (EIP 897)=
  */
  function proxyType() public pure virtual returns (uint256 proxyTypeId);

  /**
  * @dev Fallback function allowing to perform a delegatecall to the given implementation.
  * This function will return whatever the implementation call returns
  */
  fallback() external payable {
    address _impl = implementation();
    require(_impl != address(0), "Proxy implementation required");

    assembly {
      let ptr := mload(0x40)
      calldatacopy(ptr, 0, calldatasize())
      let result := delegatecall(gas(), _impl, ptr, calldatasize(), 0, 0)
      let size := returndatasize()
      returndatacopy(ptr, 0, size)

      switch result
      case 0 { revert(ptr, size) }
      default { return(ptr, size) }
    }
  
    }
  
    /**
    * @dev Receive function to accept Ether when sent directly to the contract.
    */
    receive() external virtual payable {}
  }
