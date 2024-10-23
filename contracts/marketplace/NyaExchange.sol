// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./exchange/Exchange.sol";

contract NyaExchange is Exchange, AccessControlUpgradeable, UUPSUpgradeable {
    /**
     * @dev Contract roles
     * @dev UPGRADER: Ability to upgrade contract
     * @dev SETTER: update contract config: maker fee, taker fee
     */
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");

    /**
     * Name of contract
     */
    string public constant name = "Nya Exchange";
    /**
     * Version of contract
     */
    string public constant version = "1.0";

    /**
     * @dev events
     */

    event newProxyRegistry(address registry);
    event newMakerFee(uint256 makerFee);
    event newTakerFee(uint256 takerFee);
    event newNyaMakerFee(uint256 makerFee);
    event newNyaTakerFee(uint256 takerFee);
    event newCatgirlAddress(address catgirlAddress);

    //-------------------------------------------------------------------------
    // FUNCTIONS
    //-------------------------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // Initial Function
    function initialize(
        address owner_,
        address tokenAddress_
    ) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __EIP712_init("NyaMarketplace", "1.0.0");

        _grantRole(UPGRADER_ROLE, owner_);
        _grantRole(SETTER_ROLE, owner_);
        _grantRole(DEFAULT_ADMIN_ROLE, owner_);

        MAKER_RELAYER_FEE = 500;
        TAKER_RELAYER_FEE = 0;

        MAKER_RELAYER_FEE_CAT_GIRL = 250;
        TAKER_RELAYER_FEE_CAT_GIRL = 0;
        catgirlCoinAddress = tokenAddress_;
    }

    // Public function

    function setProxyRegistry(
        address _registry
    ) external onlyRole(SETTER_ROLE) {
        registry = ProxyRegistry(_registry);
        emit newProxyRegistry(_registry);
    }
    /**
     * @dev set new fee of maker when making order
     * @param makerFee new maker fee
     */
    function setMakerFee(uint256 makerFee) public onlyRole(SETTER_ROLE) {
        require(
            makerFee <= MAXIMUM_RELAYER_FEE,
            "Maker fee should be lower than maximum fee!"
        );
        MAKER_RELAYER_FEE = makerFee;
        emit newMakerFee(makerFee);
    }

    /**
     * @dev set new fee of taker when making order
     * @param takerFee new taker fee
     */
    function setTakerFee(uint256 takerFee) public onlyRole(SETTER_ROLE) {
        require(
            takerFee <= MAXIMUM_RELAYER_FEE,
            "Taker fee should be lower than maximum fee!"
        );
        TAKER_RELAYER_FEE = takerFee;
        emit newTakerFee(takerFee);
    }

    /**
     * @dev set new fee of maker when making order by catgirl token
     * @param makerCatgirlFee new maker fee
     */
    function setMakerCatgirlFee(
        uint256 makerCatgirlFee
    ) public onlyRole(SETTER_ROLE) {
        require(
            makerCatgirlFee <= MAXIMUM_RELAYER_FEE,
            "Maker fee should be lower than maximum fee!"
        );
        MAKER_RELAYER_FEE_CAT_GIRL = makerCatgirlFee;
        emit newNyaMakerFee(makerCatgirlFee);
    }

    /**
     * @dev set new fee of taker when making order by catgirl token
     * @param takerCatgirlFee new taker fee
     */
    function setTakerCatgirlFee(
        uint256 takerCatgirlFee
    ) public onlyRole(SETTER_ROLE) {
        require(
            takerCatgirlFee <= MAXIMUM_RELAYER_FEE,
            "Taker fee should be lower than maximum fee!"
        );
        TAKER_RELAYER_FEE_CAT_GIRL = takerCatgirlFee;
        emit newNyaTakerFee(takerCatgirlFee);
    }

    /**
     * @dev set new catgirl coin address
     * @param _catgirlCoinAddress new catgirl address
     */
    function setCatgirlAddress(
        address _catgirlCoinAddress
    ) public onlyRole(SETTER_ROLE) {
        require(
            _catgirlCoinAddress != address(0),
            "Catgirl address can not be null"
        );
        catgirlCoinAddress = _catgirlCoinAddress;
        emit newCatgirlAddress(_catgirlCoinAddress);
    }

    // Internal Function

    /**
     *
     * @param newImplementation new address of implementation logic
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {}
}
