// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./UniformRandomNumber.sol";

contract Catgirl is
    Initializable,
    ERC721Upgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    ERC721BurnableUpgradeable,
    UUPSUpgradeable
{
    // @dev roles
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 constant INVERSE_BASIC_POINT = 10000;
    uint32 constant MAX_NYA_SCORE = 100;
    uint32 constant MAX_RARITY = 5;
    // @dev Reborn allow or not
    uint256 canReborn;

    /* Counter for Token ID */
    uint256 private _tokenIdCounter;

    string public baseURI;

    struct CatgirlDetails {
        uint32 characterId;
        uint32 season;
        uint8 rarity;
        uint32 nyaScore;
    }

    /**
     * @dev setting for drop rates
     */
    struct BoxSetting {
        uint256 maxPurchase;
        uint32[] probabilities;
        mapping(uint8 => uint32[]) tierToCharacters;
    }

    mapping(uint64 => BoxSetting) public boxToSettings;
    mapping(uint256 => CatgirlDetails) private catgirls;
    //-------------------------------------------------------------------------
    // EVENTS
    //-------------------------------------------------------------------------
    event CatgirlBorn(
        uint256 tokenId,
        uint32 indexed characterId,
        uint32 indexed season,
        uint8 indexed rarity,
        uint32 nyaScore,
        uint256 bornAt
    );
    event CatgirlReborn(
        uint256 indexed tokenId,
        uint32 characterId,
        uint32 indexed season,
        uint8 indexed rarity,
        uint32 nyaScore,
        uint256 bornAt
    );
    event BoxOpened(address to, CatgirlDetails[] _tokenIds);

    /**
     * @dev initialize function of contract.
     */
    function initialize(address _defaultAdmin) public initializer {
        __ERC721_init("Catgirl", "CATGIRL");
        __CatgirlNFT_init_unchained();
        __Pausable_init();
        __AccessControl_init();
        __ERC721Burnable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _defaultAdmin);
        _grantRole(PAUSER_ROLE, _defaultAdmin);
        _grantRole(MINTER_ROLE, _defaultAdmin);
        _grantRole(SETTER_ROLE, _defaultAdmin);
        _grantRole(UPGRADER_ROLE, _defaultAdmin);
    }

    /**
     * @dev Init setting of contract
     */
    function __CatgirlNFT_init_unchained() internal onlyInitializing {
        baseURI = "http://api.catgirl.io/nft/catgirls/";
        canReborn = 1;
    }

    /**
     * @dev pause the contract
     */
    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev unpause the contract
     */
    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev return current base URI
     */
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }


    /**
     *
     * @param newImplementation new address of implementation logic
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @notice get token URI of token ID
     * @param tokenId token ID need to query
     */
    function tokenURI(
        uint256 tokenId
    )
        public
        view
        override
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /**
     *
     * @param interfaceId interface ID
     */
    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(
            ERC721Upgradeable,
            AccessControlUpgradeable
        )
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     *
     * @dev check contract is currently allow reborn or not
     */
    modifier allowReborn() {
        require(canReborn != 0, "Reborn is not allowed");
        _;
    }

    /**
     *
     * @param _tokenId token ID need to check existed or not
     */
    modifier mustExist(uint256 _tokenId) {
        require(ownerOf(_tokenId) != address(0), "approved query for nonexistent token");
        _;
    }

    
    /**
     * @notice get all information of NFT
     * @param tokenId token Id of NFT
     */
    function getCatgirl(
        uint256 tokenId
    ) external view returns (CatgirlDetails memory catgirl) {
        catgirl = catgirls[tokenId];
    }

    /**
     * @param boxId box id
     * @return maxPurchase maximum number of box can be claim
     * @return probabilities probabilities of box
     */
    function getBoxSetting(
        uint64 boxId
    ) external view returns (uint256, uint32[] memory) {
        BoxSetting storage box = boxToSettings[boxId];
        return (box.maxPurchase, box.probabilities);
    }

    /**
     * @dev get tier to character by boxId and tier
     * @param boxId boxId want to query
     * @param tier tier
     */
    function getTierToCharacter(
        uint64 boxId,
        uint8 tier
    ) external view returns (uint32[] memory) {
        BoxSetting storage box = boxToSettings[boxId];
        return (box.tierToCharacters[tier]);
    }

    //-------------------------------------------------------------------------
    // STATE MODIFYING FUNCTIONS
    //-------------------------------------------------------------------------

    /**
     * @dev update new setting for box setting by id
     * @param _boxId Id of box setting, base on token type
     * @param _maxQuantity max number of box can be claim
     * @param _probabilities list of probability
     * @param _tierToCharacters list of tierToCharacters
     */
    function setOptionSettings(
        uint64 _boxId,
        uint256 _maxQuantity,
        uint32[] memory _probabilities,
        uint32[][] memory _tierToCharacters
    ) public onlyRole(SETTER_ROLE) {
        require(
            _probabilities.length == MAX_RARITY,
            "CATGIRL: Length must be the same"
        );
        require(
            _probabilities.length == _tierToCharacters.length,
            "CATGIRL: Length must be the same"
        );

        BoxSetting storage settings = boxToSettings[_boxId];
        settings.maxPurchase = _maxQuantity;
        settings.probabilities = _probabilities;
        for (uint8 i = 0; i < _tierToCharacters.length; i++) {
            settings.tierToCharacters[i] = _tierToCharacters[
                i
            ];
        }
    }

    /**
     * @dev set new base uri of token
     * @param _uri new ui
     */
    function setBaseURI(
        string memory _uri
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        baseURI = _uri;
    }

    /**
     *
     * @param _canReborn set rebornable of NFT. 0 for disable, 1 for enable
     */
    function setReborn(uint256 _canReborn) public onlyRole(DEFAULT_ADMIN_ROLE) {
        canReborn = _canReborn;
    }

    /**
     * @dev burn multiple NFT
     * @param tokenIds List of token ID need to burn
     */
    function burnMultiple(uint[] memory tokenIds) public {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            burn(tokenIds[i]);
        }
    }

    function mintByMananger(
        bytes[] memory callDatas
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        for(uint8 i = 0; i < callDatas.length; i++) {
            (address to, uint32 characterId, uint32 season, uint8 rarity, uint32 nyaScore) = abi
                .decode(
                    callDatas[i],
                    (address, uint32, uint32, uint8, uint32)
            );
            safeMint(to, rarity, nyaScore, season, characterId);
        }
    }
    /**
     *
     * @param _to Address get NFT
     * @param boxIds Box Id
     * @param _season season of NFT
     * @param _numberOfPendingBoxes List of number of box attach with random factor
     * @param _rand List of radom factor from ChainLink
     * @param totalBox Total Of box need to be opened
     */
    function openPendingBoxes(
        address _to,
        uint64[] calldata boxIds,
        uint32 _season,
        uint8[] calldata _numberOfPendingBoxes,
        uint[] calldata _rand,
        uint256 totalBox
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        CatgirlDetails[] memory tokenIds = new CatgirlDetails[](totalBox);
        address to = _to;
        uint8 count = 0;
        require(
            _numberOfPendingBoxes.length == _rand.length,
            "Length random not macth!"
        );
        for (uint8 i = 0; i < _numberOfPendingBoxes.length; i++) {
            BoxSetting storage setting = boxToSettings[boxIds[i]];
            for (uint8 j = 0; j < _numberOfPendingBoxes[i]; j++) {
                CatgirlDetails storage catgirl = internalMint(
                    to,
                    _season,
                    setting,
                    uint256(keccak256(abi.encode(_rand[i], j)))
                );
                tokenIds[count] = catgirl;
                count++;
            }
        }
        emit BoxOpened(_to, tokenIds);
    }

    /**
     *
     * @param to Address get NFT
     * @param season season of NFT
     * @param setting Boxsetting
     * @param _rand Random factor to decide rarity, character of NFT
     */
    function internalMint(
        address to,
        uint32 season,
        BoxSetting storage setting,
        uint256 _rand
    ) internal returns (CatgirlDetails storage) {
        uint256 value = UniformRandomNumber.uniform(_rand, INVERSE_BASIC_POINT);
        uint8 rarity;
        for (uint8 i = 0; i < MAX_RARITY; i++) {
            uint32 chance = setting.probabilities[i];
            if (value < chance) {
                rarity = i;
                break;
            }
            value = value - chance;
        }
        uint32 nyaScore = uint32(
            (UniformRandomNumber.uniform(uint256(keccak256(abi.encode(_rand, 1))), MAX_NYA_SCORE)) + 1
        );
        uint32[] storage characters = setting.tierToCharacters[rarity];
        uint32 characterId = characters[
            UniformRandomNumber.uniform(uint256(keccak256(abi.encode(_rand, 2))), characters.length)
        ];
        return safeMint(to, rarity, nyaScore, season, characterId);
    }

    /**
     * @dev safe mint NFT to an address
     * @param to Address would received NFT
     * @param rarity Rarity of NFT
     * @param nyaScore NYA score of NFT
     * @param season season of NFT
     * @param characterId character ID of NFT
     */
    function safeMint(
        address to,
        uint8 rarity,
        uint32 nyaScore,
        uint32 season,
        uint32 characterId
    ) internal returns (CatgirlDetails storage) {
        uint256 current = _tokenIdCounter;
        _safeMint(to, current);
        _tokenIdCounter++;
        catgirls[current] = CatgirlDetails(characterId, season, rarity, nyaScore);
        emit CatgirlBorn(
            current,
            characterId,
            season,
            rarity,
            nyaScore,
            block.timestamp
        );
        return catgirls[current];
    }
    
    /**
     * @dev Mint NFT to an address
     * @param to Address would received NFT
     * @param rarity Rarity of NFT
     * @param nyaScore NYA score of NFT
     * @param season season of NFT
     * @param characterId character ID of NFT
     */
    function externalMint(
        address to,
        uint8 rarity,
        uint32 nyaScore,
        uint32 season,
        uint32 characterId
    ) external onlyRole(MINTER_ROLE) whenNotPaused returns (CatgirlDetails memory) {
        return safeMint(to, rarity, nyaScore, season, characterId);
    }

    /**
     * @notice reborn a catgirl
     * @param _tokenId tokenId of NFT
     * @param _nyaScore new NYA score of NFT
     * @param _rarity new rarity of NFT
     * @param _season new season of NFT
     * @param _characterId new charater ID of NFT
     */
    function rebornCatgirl(
        uint256 _tokenId,
        uint32 _nyaScore,
        uint8 _rarity,
        uint32 _season,
        uint32 _characterId
    )
        external
        whenNotPaused
        onlyRole(MINTER_ROLE)
        mustExist(_tokenId)
        allowReborn
    {
        catgirls[_tokenId].season = _season;
        catgirls[_tokenId].nyaScore = _nyaScore;
        catgirls[_tokenId].rarity = _rarity;
        catgirls[_tokenId].characterId = _characterId;

        emit CatgirlReborn(
            _tokenId,
            _characterId,
            _season,
            _rarity,
            _nyaScore,
            block.timestamp
        );
    }

}
