// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import "../libraries/ArrayUtils.sol";
import "../libraries/SaleKindInterface.sol";
import "./ExchangeCore.sol";

contract Exchange is ExchangeCore {
    /**
     * @notice Maximum fee of maker of taker
     */
    uint256 public constant MAXIMUM_RELAYER_FEE = 500;
    /**
     * @notice Fee of maker
     */
    uint256 public MAKER_RELAYER_FEE;
    /**
     * @notice Fee of taker
     */
    uint256 public TAKER_RELAYER_FEE;

    /**
     * @notice maker fee for catgirl token
     */
    uint256 public MAKER_RELAYER_FEE_CAT_GIRL;

    uint256 public TAKER_RELAYER_FEE_CAT_GIRL;

    /**
     * @notice dev: 0xE499B06f48F552fd2c4E4a72269ff83a9B15f2CE
     * mainnet: 0x79eBC9A2ce02277A4b5b3A768b1C0A4ed75Bd936
     */
    address public catgirlCoinAddress;
    uint256[50] private __gap;
        /**
     * @dev Call atomicMatch - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function atomicMatch_(
        address[12] memory addrs,
        uint256[8] memory uints,
        uint8[6] memory saleKinds,
        bytes memory calldataBuy,
        bytes memory calldataSell,
        bytes memory replacementPatternBuy,
        bytes memory replacementPatternSell,
        uint8[2] memory vs,
        bytes32[4] memory rssMetadata
    ) external payable {
        uint256 makerFee = MAKER_RELAYER_FEE;
        uint256 takerFee = TAKER_RELAYER_FEE;

        if (addrs[5] == catgirlCoinAddress || addrs[11] == catgirlCoinAddress) {
            makerFee = MAKER_RELAYER_FEE_CAT_GIRL;
            takerFee = TAKER_RELAYER_FEE_CAT_GIRL;
        }

        atomicMatch(
            Order(
                addrs[0],
                addrs[1],
                addrs[2],
                makerFee,
                takerFee,
                addrs[3],
                SaleKindInterface.Side(saleKinds[0]),
                SaleKindInterface.SaleKind(saleKinds[1]),
                AuthenticatedProxy.HowToCall(saleKinds[2]),
                addrs[4],
                calldataBuy,
                replacementPatternBuy,
                addrs[5],
                uints[0],
                uints[1],
                uints[2],
                uints[3]
            ),
            Sig(vs[0], rssMetadata[0], rssMetadata[1]),
            Order(
                addrs[6],
                addrs[7],
                addrs[8],
                makerFee,
                takerFee,
                addrs[9],
                SaleKindInterface.Side(saleKinds[3]),
                SaleKindInterface.SaleKind(saleKinds[4]),
                AuthenticatedProxy.HowToCall(saleKinds[5]),
                addrs[10],
                calldataSell,
                replacementPatternSell,
                addrs[11],
                uints[4],
                uints[5],
                uints[6],
                uints[7]
            ),
            Sig(vs[1], rssMetadata[2], rssMetadata[3])
        );
    }


    /**
     * @dev Call cancelOrder - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function cancelOrder_(
        address[6] memory addrs,
        uint256[4] memory uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        AuthenticatedProxy.HowToCall howToCall,
        bytes memory callData,
        bytes memory replacementPattern,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        uint256 makerFee = MAKER_RELAYER_FEE;
        uint256 takerFee = TAKER_RELAYER_FEE;

        if (addrs[5] == catgirlCoinAddress) {
            makerFee = MAKER_RELAYER_FEE_CAT_GIRL;
            takerFee = TAKER_RELAYER_FEE_CAT_GIRL;
        }

        cancelOrder(
            Order(
                addrs[0],
                addrs[1],
                addrs[2],
                makerFee,
                takerFee,
                addrs[3],
                side,
                saleKind,
                howToCall,
                addrs[4],
                callData,
                replacementPattern,
                addrs[5],
                uints[0],
                uints[1],
                uints[2],
                uints[3]
            ),
            Sig(v, r, s)
        );
    }

    /**
     * @dev Call calculateFinalPrice - library function exposed for testing.
     * @param side side of user in an order, maker or taker
     * @param saleKind kind of sale (fixed price or auction)
     * @param basePrice base price of order
     * @param extra extra cost of order
     * @param listingTime time of listing
     * @param expirationTime time this order would expire
     */
    function calculateFinalPrice(
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        uint256 basePrice,
        uint256 extra,
        uint256 listingTime,
        uint256 expirationTime
    ) external view returns (uint256) {
        return
            SaleKindInterface.calculateFinalPrice(
                side,
                saleKind,
                basePrice,
                extra,
                listingTime,
                expirationTime
            );
    }

    /**
     * @dev Call hashOrder - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function hashOrder_(
        address[6] memory addrs,
        uint256[4] memory uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        AuthenticatedProxy.HowToCall howToCall,
        bytes memory callData,
        bytes memory replacementPattern
    ) external view returns (bytes32) {
        uint256 makerFee = MAKER_RELAYER_FEE;
        uint256 takerFee = TAKER_RELAYER_FEE;

        if (addrs[5] == catgirlCoinAddress) {
            makerFee = MAKER_RELAYER_FEE_CAT_GIRL;
            takerFee = TAKER_RELAYER_FEE_CAT_GIRL;
        }
        return
            hashOrder(
                Order(
                    addrs[0],
                    addrs[1],
                    addrs[2],
                    makerFee,
                    takerFee,
                    addrs[3],
                    side,
                    saleKind,
                    howToCall,
                    addrs[4],
                    callData,
                    replacementPattern,
                    addrs[5],
                    uints[0],
                    uints[1],
                    uints[2],
                    uints[3]
                )
            );
    }

    /**
     * @dev Call hashToSignTypedDataV4 followd by EIP 712
     */
    function hashToSign_(
        address[6] memory addrs,
        uint256[4] memory uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        AuthenticatedProxy.HowToCall howToCall,
        bytes memory callData,
        bytes memory replacementPattern
    ) external view returns (bytes32) {
        uint256 makerFee = MAKER_RELAYER_FEE;
        uint256 takerFee = TAKER_RELAYER_FEE;

        if (addrs[5] == catgirlCoinAddress) {
            makerFee = MAKER_RELAYER_FEE_CAT_GIRL;
            takerFee = TAKER_RELAYER_FEE_CAT_GIRL;
        }
        return
            hashToSignTypedDataV4(
                Order(
                    addrs[0],
                    addrs[1],
                    addrs[2],
                    makerFee,
                    takerFee,
                    addrs[3],
                    side,
                    saleKind,
                    howToCall,
                    addrs[4],
                    callData,
                    replacementPattern,
                    addrs[5],
                    uints[0],
                    uints[1],
                    uints[2],
                    uints[3]
                )
            );
    }

    /**
     * @dev Call validateOrderParameters - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function validateOrderParameters_(
        address[6] memory addrs,
        uint256[4] memory uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        AuthenticatedProxy.HowToCall howToCall,
        bytes memory callData,
        bytes memory replacementPattern
    ) external view returns (bool) {
        uint256 makerFee = MAKER_RELAYER_FEE;
        uint256 takerFee = TAKER_RELAYER_FEE;

        if (addrs[5] == catgirlCoinAddress) {
            makerFee = MAKER_RELAYER_FEE_CAT_GIRL;
            takerFee = TAKER_RELAYER_FEE_CAT_GIRL;
        }
        Order memory order = Order(
            addrs[0],
            addrs[1],
            addrs[2],
            makerFee,
            takerFee,
            addrs[3],
            side,
            saleKind,
            howToCall,
            addrs[4],
            callData,
            replacementPattern,
            addrs[5],
            uints[0],
            uints[1],
            uints[2],
            uints[3]
        );
        return validateOrderParameters(order);
    }

    /**
     * @dev Call validateOrder - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function validateOrder_(
        address[6] memory addrs,
        uint256[4] memory uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        AuthenticatedProxy.HowToCall howToCall,
        bytes memory callData,
        bytes memory replacementPattern,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external view returns (bool) {
        uint256 makerFee = MAKER_RELAYER_FEE;
        uint256 takerFee = TAKER_RELAYER_FEE;

        if (addrs[5] == catgirlCoinAddress) {
            makerFee = MAKER_RELAYER_FEE_CAT_GIRL;
            takerFee = TAKER_RELAYER_FEE_CAT_GIRL;
        }
        Order memory order = Order(
            addrs[0],
            addrs[1],
            addrs[2],
            makerFee,
            takerFee,
            addrs[3],
            side,
            saleKind,
            howToCall,
            addrs[4],
            callData,
            replacementPattern,
            addrs[5],
            uints[0],
            uints[1],
            uints[2],
            uints[3]
        );

        return validateOrder(hashToSignTypedDataV4(order), order, Sig(v, r, s));
    }

    /**
     * @dev Call ordersCanMatch - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function ordersCanMatch_(
        address[12] memory addrs,
        uint256[8] memory uints,
        uint8[6] memory saleKinds,
        bytes memory calldataBuy,
        bytes memory calldataSell,
        bytes memory replacementPatternBuy,
        bytes memory replacementPatternSell
    ) external view returns (bool) {
        uint256 makerFee = MAKER_RELAYER_FEE;
        uint256 takerFee = TAKER_RELAYER_FEE;

        if (addrs[5] == catgirlCoinAddress || addrs[11] == catgirlCoinAddress) {
            makerFee = MAKER_RELAYER_FEE_CAT_GIRL;
            takerFee = TAKER_RELAYER_FEE_CAT_GIRL;
        }
        Order memory buy = Order(
            addrs[0],
            addrs[1],
            addrs[2],
            makerFee,
            takerFee,
            addrs[3],
            SaleKindInterface.Side(saleKinds[0]),
            SaleKindInterface.SaleKind(saleKinds[1]),
            AuthenticatedProxy.HowToCall(saleKinds[2]),
            addrs[4],
            calldataBuy,
            replacementPatternBuy,
            addrs[5],
            uints[0],
            uints[1],
            uints[2],
            uints[3]
        );
        Order memory sell = Order(
            addrs[6],
            addrs[7],
            addrs[8],
            makerFee,
            takerFee,
            addrs[9],
            SaleKindInterface.Side(saleKinds[3]),
            SaleKindInterface.SaleKind(saleKinds[4]),
            AuthenticatedProxy.HowToCall(saleKinds[5]),
            addrs[10],
            calldataSell,
            replacementPatternSell,
            addrs[11],
            uints[4],
            uints[5],
            uints[6],
            uints[7]
        );

        return ordersCanMatch(buy, sell);
    }

    /**
     * @dev Return whether or not two orders' calldata specifications can match
     * @param buyCalldata Buy-side order calldata
     * @param buyReplacementPattern Buy-side order calldata replacement mask
     * @param sellCalldata Sell-side order calldata
     * @param sellReplacementPattern Sell-side order calldata replacement mask
     * @return Whether the orders' calldata can be matched
     */
    function orderCalldataCanMatch(
        bytes memory buyCalldata,
        bytes memory buyReplacementPattern,
        bytes memory sellCalldata,
        bytes memory sellReplacementPattern
    ) external pure returns (bool) {
        if (buyReplacementPattern.length > 0) {
            ArrayUtils.guardedArrayReplace(
                buyCalldata,
                sellCalldata,
                buyReplacementPattern
            );
        }
        if (sellReplacementPattern.length > 0) {
            ArrayUtils.guardedArrayReplace(
                sellCalldata,
                buyCalldata,
                sellReplacementPattern
            );
        }
        return ArrayUtils.arrayEq(buyCalldata, sellCalldata);
    }

    /**
     * @dev Call calculateMatchPrice - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function calculateMatchPrice_(
        address[12] memory addrs,
        uint256[8] memory uints,
        uint8[6] memory saleKinds,
        bytes memory calldataBuy,
        bytes memory calldataSell,
        bytes memory replacementPatternBuy,
        bytes memory replacementPatternSell
    ) external view returns (uint256) {
        uint256 makerFee = MAKER_RELAYER_FEE;
        uint256 takerFee = TAKER_RELAYER_FEE;

        if (addrs[5] == catgirlCoinAddress || addrs[11] == catgirlCoinAddress) {
            makerFee = MAKER_RELAYER_FEE_CAT_GIRL;
            takerFee = TAKER_RELAYER_FEE_CAT_GIRL;
        }
        Order memory buy = Order(
            addrs[0],
            addrs[1],
            addrs[2],
            makerFee,
            takerFee,
            addrs[3],
            SaleKindInterface.Side(saleKinds[0]),
            SaleKindInterface.SaleKind(saleKinds[1]),
            AuthenticatedProxy.HowToCall(saleKinds[2]),
            addrs[4],
            calldataBuy,
            replacementPatternBuy,
            addrs[5],
            uints[0],
            uints[1],
            uints[2],
            uints[3]
        );
        Order memory sell = Order(
            addrs[6],
            addrs[7],
            addrs[8],
            makerFee,
            takerFee,
            addrs[9],
            SaleKindInterface.Side(saleKinds[3]),
            SaleKindInterface.SaleKind(saleKinds[4]),
            AuthenticatedProxy.HowToCall(saleKinds[5]),
            addrs[10],
            calldataSell,
            replacementPatternSell,
            addrs[11],
            uints[4],
            uints[5],
            uints[6],
            uints[7]
        );
        return calculateMatchPrice(buy, sell);
    }
}
