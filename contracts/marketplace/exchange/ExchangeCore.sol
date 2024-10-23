// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../registry/ProxyRegistry.sol";
import "../registry/AuthenticatedProxy.sol";
import "../libraries/ArrayUtils.sol";
import "../libraries/SaleKindInterface.sol";

contract ExchangeCore is ReentrancyGuardUpgradeable, EIP712Upgradeable {
    using SafeERC20 for IERC20;

    // keccak256("HashOrder(bytes32 orderHash)")
    bytes32 public constant HASH_ORDER_TYPEHASH =
        0x957467ab3d18dcd4442210ea086160fe85eaedbc5c35a37f5721bf4cb7d5f6d7;

    bytes32 private constant _ORDER_TYPEHASH =
        0xdba08a88a748f356e8faf8578488343eab21b1741728779c9dcfdc782bc800f8;

    /* Inverse basis point. */
    uint256 public constant INVERSE_BASIS_POINT = 10000;
    /* Cancelled / finalized orders, by hash. */
    mapping(bytes32 => bool) public cancelledOrFinalized;

    /* User registry. */
    ProxyRegistry public registry;

    /* An ECDSA signature. */
    struct Sig {
        /* v parameter */
        uint8 v;
        /* r parameter */
        bytes32 r;
        /* s parameter */
        bytes32 s;
    }

    /* An order on the exchange. */
    struct Order {
        address exchange;
        /* Order maker address. */
        address maker;
        /* Order taker address, if specified. */
        address taker;
        /* Maker relayer fee of the order, unused for taker order. */
        uint256 makerRelayerFee;
        /* Taker relayer fee of the order, or maximum taker fee for a taker order. */
        uint256 takerRelayerFee;
        /* Order fee recipient or zero address for taker order. */
        address feeRecipient;
        /* Side (buy/sell). */
        SaleKindInterface.Side side;
        /* Kind of sale. */
        SaleKindInterface.SaleKind saleKind;
        AuthenticatedProxy.HowToCall howToCall;
        /* Target. */
        address target;
        /* Calldata. */
        bytes callData;
        bytes replacementPattern;
        /* Token used to pay for the order, or the zero-address as a sentinel value for Ether. */
        address paymentToken;
        /* Base price of the order (in paymentTokens). */
        uint256 basePrice;
        /* Listing timestamp. */
        uint256 listingTime;
        /* Expiration timestamp - 0 for no expiry. */
        uint256 expirationTime;
        /* Order salt, used to prevent duplicate hashes. */
        uint256 salt;
    }

    event OrderApprovedPartOne(
        bytes32 indexed hash,
        address exchange,
        address indexed maker,
        address taker,
        uint256 makerRelayerFee,
        uint256 takerRelayerFee,
        address indexed feeRecipient,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        address target
    );
    event OrderApprovedPartTwo(
        bytes32 indexed hash,
        bytes callData,
        address paymentToken,
        uint256 basePrice,
        uint256 listingTime,
        uint256 expirationTime,
        uint256 salt,
        bool orderbookInclusionDesired,
        AuthenticatedProxy.HowToCall howToCall,
        bytes replacementPattern
    );
    event OrderCancelled(bytes32 indexed hash);
    event OrdersMatched(
        bytes32 buyHash,
        bytes32 sellHash,
        address indexed maker,
        address indexed taker,
        uint256 price
    );

    uint256[50] private __gap;
    /**
     * @dev Transfer tokens
     * @param token Token to transfer
     * @param from Address to charge fees
     * @param to Address to receive fees
     * @param amount Amount of protocol tokens to charge
     */
    function transferTokens(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal {
        if (amount > 0) {
            IERC20(token).safeTransferFrom(from, to, amount);
        }
    }

    /**
     * @dev Hash an order
     * @param order Order to hash
     */
    function hashOrder(
        Order memory order
    ) internal pure returns (bytes32 hash) {
        uint256 size = 800;
        bytes memory array = new bytes(size);
        uint256 index;
        assembly {
            index := add(array, 0x20)
        }
        index = ArrayUtils.unsafeWriteBytes32(index, _ORDER_TYPEHASH);
        index = ArrayUtils.unsafeWriteAddressWord(index, order.exchange);
        index = ArrayUtils.unsafeWriteAddressWord(index, order.maker);
        index = ArrayUtils.unsafeWriteAddressWord(index, order.taker);
        index = ArrayUtils.unsafeWriteUint(index, order.makerRelayerFee);
        index = ArrayUtils.unsafeWriteUint(index, order.takerRelayerFee);
        index = ArrayUtils.unsafeWriteAddressWord(index, order.feeRecipient);
        index = ArrayUtils.unsafeWriteUint8Word(index, uint8(order.side));
        index = ArrayUtils.unsafeWriteUint8Word(index, uint8(order.saleKind));
        index = ArrayUtils.unsafeWriteAddressWord(index, order.target);
        index = ArrayUtils.unsafeWriteUint8Word(index, uint8(order.howToCall));
        index = ArrayUtils.unsafeWriteBytes32(index, keccak256(order.callData));
        index = ArrayUtils.unsafeWriteBytes32(
            index,
            keccak256(order.replacementPattern)
        );
        index = ArrayUtils.unsafeWriteAddressWord(index, order.paymentToken);
        index = ArrayUtils.unsafeWriteUint(index, order.basePrice);
        index = ArrayUtils.unsafeWriteUint(index, order.listingTime);
        index = ArrayUtils.unsafeWriteUint(index, order.expirationTime);
        index = ArrayUtils.unsafeWriteUint(index, order.salt);
        assembly {
            hash := keccak256(add(array, 0x20), size)
        }
        return hash;
    }

    /**
     * @dev Hash an order, returning the hash that a client must sign, including the standard message prefix
     * @param order Order to hash
     * @return Hash of message prefix and order hash by typed data v4
     */
    function hashToSignTypedDataV4(
        Order memory order
    ) internal view returns (bytes32) {
        bytes32 hash = _hashTypedDataV4(
            keccak256(abi.encode(HASH_ORDER_TYPEHASH, hashOrder(order)))
        );
        return hash;
    }

    /**
     * @dev Assert an order is valid and return its hash
     * @param order Order to validate
     * @param sig ECDSA signature
     */
    function requireValidOrder(
        Order memory order,
        Sig memory sig
    ) internal view returns (bytes32) {
        bytes32 hash = hashToSignTypedDataV4(order);
        require(
            validateOrder(hash, order, sig),
            "Invalid Order Hash or already cancelled!"
        );
        return hash;
    }

    /**
     * @dev Validate order parameters (does *not* check signature validity)
     * @param order Order to validate
     */
    function validateOrderParameters(
        Order memory order
    ) internal view returns (bool) {
        /* Order must be targeted at this protocol version (this Exchange.sol contract). */
        if (order.exchange != address(this)) {
            return false;
        }

        /* Order must possess valid sale kind parameter combination. */
        if (
            !SaleKindInterface.validateParameters(
                order.saleKind,
                order.expirationTime
            )
        ) {
            return false;
        }

        return true;
    }

    /**
     * @dev Validate a provided previously approved / signed order, hash, and signature.
     * @param hash Order hash (already calculated, passed to avoid recalculation)
     * @param order Order to validate
     * @param sig ECDSA signature
     */
    function validateOrder(
        bytes32 hash,
        Order memory order,
        Sig memory sig
    ) internal view returns (bool) {
        /* Not done in an if-conditional to prevent unnecessary ecrecover evaluation, which seems to happen even though it should short-circuit. */

        /* Order must have valid parameters. */
        if (!validateOrderParameters(order)) {
            return false;
        }

        /* Order must have not been canceled or already filled. */
        if (cancelledOrFinalized[hash]) {
            return false;
        }

        /* or (b) ECDSA-signed by maker. */
        if (ECDSA.recover(hash, sig.v, sig.r, sig.s) == order.maker) {
            return true;
        }

        return false;
    }

    /**
     * @dev Cancel an order, preventing it from being matched. Must be called by the maker of the order
     * @param order Order to cancel
     * @param sig ECDSA signature
     */
    function cancelOrder(Order memory order, Sig memory sig) internal {
        /* CHECKS */

        /* Calculate order hash. */
        bytes32 hash = requireValidOrder(order, sig);

        /* Assert sender is authorized to cancel order. */
        require(
            msg.sender == order.maker,
            "NYA_Exchange::Sender is not maker!"
        );

        /* EFFECTS */

        /* Mark order as cancelled, preventing it from being matched. */
        cancelledOrFinalized[hash] = true;

        /* Log cancel event. */
        emit OrderCancelled(hash);
    }

    /**
     * @dev Calculate the price two orders would match at, if in fact they would match (otherwise fail)
     * @param buy Buy-side order
     * @param sell Sell-side order
     * @return Match price
     */
    function calculateMatchPrice(
        Order memory buy,
        Order memory sell
    ) internal pure returns (uint256) {
        /* Calculate sell price. */
        uint256 sellPrice = sell.basePrice;

        /* Calculate buy price. */
        uint256 buyPrice = buy.basePrice;

        /* Require price cross. */
        require(
            buyPrice >= sellPrice,
            "NYA_Exchange::Buy price must greater than sell price!"
        );

        /* Maker/taker priority. */
        return sell.feeRecipient != address(0) ? sellPrice : buyPrice;
    }

    /**
     * @dev Execute all ERC20 token / Ether transfers associated with an order match (fees and buyer => seller transfer)
     * @param buy Buy-side order
     * @param sell Sell-side order
     */
    function executeFundsTransfer(
        Order memory buy,
        Order memory sell
    ) internal returns (uint256) {
        /* Only payable in the special case of unwrapped Ether. */
        if (sell.paymentToken != address(0)) {
            require(msg.value == 0, "NYA_Exchange::Redundant sent funds!");
        }

        /* Calculate match price. */
        uint256 price = calculateMatchPrice(buy, sell);

        /* Transfer tokens to seller before deducting fees to ensure they have sufficient balance */
        if (price > 0 && sell.paymentToken != address(0)) {
            transferTokens(sell.paymentToken, buy.maker, sell.maker, price);
        }

        /* Amount that will be received by seller (for Ether). */
        uint256 receiveAmount = price;

        /* Amount that must be sent by buyer (for Ether). */
        uint256 requiredAmount = price;

        /* Determine maker/taker and charge fees accordingly. */
        if (sell.feeRecipient != address(0)) {
            /* Assert taker fee is less than or equal to maximum fee specified by buyer. */
            require(
                sell.takerRelayerFee <= buy.takerRelayerFee,
                "NYA_Exchange::Taker fee is more than maximum fee specified by buyer"
            );

            if (sell.makerRelayerFee > 0) {
                uint256 makerRelayerFee = (sell.makerRelayerFee * price) /
                    INVERSE_BASIS_POINT;
                if (sell.paymentToken == address(0)) {
                    receiveAmount = receiveAmount - makerRelayerFee;
                    (bool success, ) = payable(sell.feeRecipient).call{
                        value: makerRelayerFee
                    }("");
                    require(
                        success,
                        "NYA_Exchange::Fee transfer to maker failed!"
                    );
                } else {
                    transferTokens(
                        sell.paymentToken,
                        sell.maker,
                        sell.feeRecipient,
                        makerRelayerFee
                    );
                }
            }

            if (sell.takerRelayerFee > 0) {
                uint256 takerRelayerFee = (sell.takerRelayerFee * price) /
                    INVERSE_BASIS_POINT;
                if (sell.paymentToken == address(0)) {
                    requiredAmount = requiredAmount + takerRelayerFee;
                    (bool success, ) = payable(sell.feeRecipient).call{
                        value: takerRelayerFee
                    }("");
                    require(
                        success,
                        "NYA_Exchange::Fee transfer to taker failed!"
                    );
                } else {
                    transferTokens(
                        sell.paymentToken,
                        buy.maker,
                        sell.feeRecipient,
                        takerRelayerFee
                    );
                }
            }
        } else {
            /* Assert taker fee is less than or equal to maximum fee specified by seller. */
            require(
                buy.takerRelayerFee <= sell.takerRelayerFee,
                "NYA_Exchange::Taker fee is more than maximum fee specified by seller"
            );

            /* The Exchange.sol does not escrow Ether, so direct Ether can only be used with sell-side maker / buy-side taker orders. */
            require(
                sell.paymentToken != address(0),
                "Payment token cannot be Ether in this context!"
            );

            if (buy.makerRelayerFee > 0) {
                uint256 makerRelayerFee = (buy.makerRelayerFee * price) /
                    INVERSE_BASIS_POINT;
                transferTokens(
                    sell.paymentToken,
                    buy.maker,
                    buy.feeRecipient,
                    makerRelayerFee
                );
            }

            if (buy.takerRelayerFee > 0) {
                uint256 takerRelayerFee = (buy.takerRelayerFee * price) /
                    INVERSE_BASIS_POINT;
                transferTokens(
                    sell.paymentToken,
                    sell.maker,
                    buy.feeRecipient,
                    takerRelayerFee
                );
            }
        }

        if (sell.paymentToken == address(0)) {
            /* Special-case Ether, order must be matched by buyer. */
            require(
                msg.value >= requiredAmount,
                "Required sent Ether amount is not enough"
            );
            (bool successPayment, ) = payable(sell.maker).call{
                value: receiveAmount
            }("");
            require(successPayment, "Send funds to seller failed!");
            /* Allow overshoot for variable-price auctions, refund difference. */
            uint256 diff = msg.value - requiredAmount;

            if (diff > 0) {
                (bool successReturnOverValue, ) = payable(buy.maker).call{
                    value: diff
                }("");
                require(
                    successReturnOverValue,
                    "Send diff amount to buyer failed!"
                );
            }
        }

        /* This contract should never hold Ether, however, we cannot assert this, since it is impossible to prevent anyone from sending Ether e.g. with selfdestruct. */

        return price;
    }

    /**
     * @dev Return whether or not two orders can be matched with each other by basic parameters (does not check order signatures / calldata or perform static calls)
     * @param buy Buy-side order
     * @param sell Sell-side order
     * @return Whether or not the two orders can be matched
     */
    function ordersCanMatch(
        Order memory buy,
        Order memory sell
    ) internal view returns (bool) {
        return (/* Must be opposite-side. */
        (buy.side == SaleKindInterface.Side.Buy &&
            sell.side == SaleKindInterface.Side.Sell) &&
            /* Must use same payment token. */
            (buy.paymentToken == sell.paymentToken) &&
            /* Must match maker/taker addresses. */
            (sell.taker == address(0) || sell.taker == buy.maker) &&
            (buy.taker == address(0) || buy.taker == sell.maker) &&
            /* One must be maker and the other must be taker (no bool XOR in Solidity). */
            ((sell.feeRecipient == address(0) &&
                buy.feeRecipient != address(0)) ||
                (sell.feeRecipient != address(0) &&
                    buy.feeRecipient == address(0))) &&
            /* Must match target. */
            (buy.target == sell.target) &&
            /* Must match howToCall. */
            (buy.howToCall == sell.howToCall) &&
            /* Buy-side order must be settleable. */
            SaleKindInterface.canSettleOrder(
                buy.listingTime,
                buy.expirationTime
            ) &&
            /* Sell-side order must be settleable. */
            SaleKindInterface.canSettleOrder(
                sell.listingTime,
                sell.expirationTime
            ));
    }

    /**
     * @dev Atomically match two orders, ensuring validity of the match, and execute all associated state transitions. Protected against reentrancy by a contract-global lock.
     * @param buy Buy-side order
     * @param buySig Buy-side order signature
     * @param sell Sell-side order
     * @param sellSig Sell-side order signature
     */
    function atomicMatch(
        Order memory buy,
        Sig memory buySig,
        Order memory sell,
        Sig memory sellSig
    ) internal nonReentrant {
        /* CHECKS */
        /* Ensure buy order validity and calculate hash if necessary. */
        bytes32 buyHash;
        if (buy.maker == msg.sender) {
            require(
                validateOrderParameters(buy),
                "NYA_Exchange::Invalid buy order params!"
            );
        } else {
            buyHash = requireValidOrder(buy, buySig);
        }
        /* Ensure sell order validity and calculate hash if necessary. */
        bytes32 sellHash;
        if (sell.maker == msg.sender) {
            require(
                validateOrderParameters(sell),
                "NYA_Exchange::Invalid sell order params!"
            );
        } else {
            sellHash = requireValidOrder(sell, sellSig);
        }

        /* Must be matchable. */
        require(ordersCanMatch(buy, sell), "NYA_Exchange::Order not matched");
        /* Target must exist (prevent malicious selfdestructs just prior to order settlement). */
        uint256 size;
        address target = sell.target;
        assembly {
            size := extcodesize(target)
        }
        require(size > 0, "NYA_Exchange::Order target is not a contract!");
        /* Must match calldata after replacement, if specified. */
        if (buy.replacementPattern.length > 0) {
            ArrayUtils.guardedArrayReplace(
                buy.callData,
                sell.callData,
                buy.replacementPattern
            );
        }
        if (sell.replacementPattern.length > 0) {
            ArrayUtils.guardedArrayReplace(
                sell.callData,
                buy.callData,
                sell.replacementPattern
            );
        }
        require(
            ArrayUtils.arrayEq(buy.callData, sell.callData),
            "NYA_Exchange::Calldata after replacement is invalid!"
        );

        /* Retrieve delegateProxy contract. */
        OwnableDelegateProxy delegateProxy = registry.proxies(sell.maker);

        /* Proxy must exist. */
        require(
            address(delegateProxy) != address(0),
            "NYA_Exchange::Proxy not exists!"
        );

        /* Assert implementation. */
        require(
            delegateProxy.implementation() ==
                registry.delegateProxyImplementation(),
            "NYA_Exchange::Proxy implementation is invalid!"
        );

        /* Access the passthrough AuthenticatedProxy. */
        AuthenticatedProxy proxy = AuthenticatedProxy(
            payable(address(delegateProxy))
        );

        /* Mark previously signed or approved orders as finalized. */
        if (msg.sender != buy.maker) {
            cancelledOrFinalized[buyHash] = true;
        }
        if (msg.sender != sell.maker) {
            cancelledOrFinalized[sellHash] = true;
        }

        /* Execute funds transfer and pay fees. */
        uint256 price = executeFundsTransfer(buy, sell);

        require(
            proxy.proxy(sell.target, sell.howToCall, sell.callData),
            "NYA_Exchange::ERC721 Transfer failed!"
        );

        /* Log match event. */
        emit OrdersMatched(
            buyHash,
            sellHash,
            sell.feeRecipient != address(0) ? sell.maker : buy.maker,
            sell.feeRecipient != address(0) ? buy.maker : sell.maker,
            price
        );
    }
}
