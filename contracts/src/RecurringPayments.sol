// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RecurringPayments is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum SubscriptionState {
        None,
        Active,
        Paused,
        Cancelled
    }

    struct Subscription {
        address payer;
        address payee;
        uint256 amount;
        uint256 interval;
        uint256 nextPaymentAt;
        uint256 endAt;
        uint256 totalPaid;
        uint256 paymentsCount;
        SubscriptionState state;
        string label;
    }

    struct SubscriptionView {
        address payer;
        address payee;
        uint256 amount;
        uint256 interval;
        uint256 nextPaymentAt;
        uint256 endAt;
        uint256 totalPaid;
        uint256 paymentsCount;
        bool active;
        string label;
    }

    IERC20 public immutable usdc;
    uint256 public minInterval;
    uint256 public nextSubscriptionId = 1;

    mapping(uint256 => Subscription) private subscriptions;
    mapping(address => uint256[]) private payerSubscriptions;

    event SubscriptionCreated(
        uint256 indexed subId,
        address indexed payer,
        address indexed payee,
        uint256 amount,
        uint256 interval,
        uint256 startAt,
        uint256 endAt,
        string label
    );
    event SubscriptionPaused(uint256 indexed subId, address indexed payer);
    event SubscriptionResumed(uint256 indexed subId, address indexed payer, uint256 nextPaymentAt);
    event SubscriptionCancelled(uint256 indexed subId, address indexed payer);
    event PaymentExecuted(
        uint256 indexed subId,
        address indexed payer,
        address indexed payee,
        uint256 amount,
        uint256 nextPaymentAt,
        uint256 totalPaid,
        uint256 paymentsCount
    );
    event MinIntervalUpdated(uint256 minInterval);

    error ZeroAddress();
    error InvalidAmount();
    error InvalidInterval();
    error InvalidStartAt();
    error InvalidEndAt();
    error Unauthorized();
    error SubscriptionNotFound();
    error SubscriptionNotActive();
    error SubscriptionNotPaused();
    error SubscriptionCancelledState();
    error SubscriptionExpired();
    error PaymentNotDue();

    constructor(address usdcToken, address initialOwner, uint256 initialMinInterval) Ownable(initialOwner) {
        if (usdcToken == address(0) || initialOwner == address(0)) revert ZeroAddress();
        if (initialMinInterval == 0) revert InvalidInterval();

        usdc = IERC20(usdcToken);
        minInterval = initialMinInterval;

        emit MinIntervalUpdated(initialMinInterval);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setMinInterval(uint256 nextMinInterval) external onlyOwner {
        if (nextMinInterval == 0) revert InvalidInterval();
        minInterval = nextMinInterval;
        emit MinIntervalUpdated(nextMinInterval);
    }

    function createSubscription(
        address payee,
        uint256 amount,
        uint256 interval,
        uint256 startAt,
        uint256 endAt,
        string calldata label
    ) external whenNotPaused returns (uint256 subId) {
        if (payee == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        if (interval < minInterval) revert InvalidInterval();

        uint256 effectiveStart = startAt == 0 ? block.timestamp : startAt;
        if (effectiveStart < block.timestamp) revert InvalidStartAt();
        if (endAt != 0 && endAt < effectiveStart) revert InvalidEndAt();

        subId = nextSubscriptionId++;
        subscriptions[subId] = Subscription({
            payer: msg.sender,
            payee: payee,
            amount: amount,
            interval: interval,
            nextPaymentAt: effectiveStart,
            endAt: endAt,
            totalPaid: 0,
            paymentsCount: 0,
            state: SubscriptionState.Active,
            label: label
        });
        payerSubscriptions[msg.sender].push(subId);

        emit SubscriptionCreated(subId, msg.sender, payee, amount, interval, effectiveStart, endAt, label);
    }

    function cancelSubscription(uint256 subId) external whenNotPaused {
        Subscription storage subscription = subscriptions[subId];
        _requireSubscriptionExists(subscription);
        if (subscription.payer != msg.sender) revert Unauthorized();
        if (subscription.state == SubscriptionState.Cancelled) revert SubscriptionCancelledState();

        subscription.state = SubscriptionState.Cancelled;
        emit SubscriptionCancelled(subId, msg.sender);
    }

    function pauseSubscription(uint256 subId) external whenNotPaused {
        Subscription storage subscription = subscriptions[subId];
        _requireSubscriptionExists(subscription);
        if (subscription.payer != msg.sender) revert Unauthorized();
        if (subscription.state != SubscriptionState.Active) revert SubscriptionNotActive();

        subscription.state = SubscriptionState.Paused;
        emit SubscriptionPaused(subId, msg.sender);
    }

    function resumeSubscription(uint256 subId) external whenNotPaused {
        Subscription storage subscription = subscriptions[subId];
        _requireSubscriptionExists(subscription);
        if (subscription.payer != msg.sender) revert Unauthorized();
        if (subscription.state == SubscriptionState.Cancelled) revert SubscriptionCancelledState();
        if (subscription.state != SubscriptionState.Paused) revert SubscriptionNotPaused();
        if (subscription.endAt != 0 && subscription.endAt < block.timestamp) revert SubscriptionExpired();

        subscription.state = SubscriptionState.Active;
        if (subscription.nextPaymentAt < block.timestamp) {
            subscription.nextPaymentAt = block.timestamp;
        }

        emit SubscriptionResumed(subId, msg.sender, subscription.nextPaymentAt);
    }

    function executePayment(uint256 subId) external whenNotPaused nonReentrant {
        Subscription storage subscription = subscriptions[subId];
        _requireSubscriptionExists(subscription);
        if (subscription.state == SubscriptionState.Cancelled) revert SubscriptionCancelledState();
        if (subscription.state != SubscriptionState.Active) revert SubscriptionNotActive();
        if (subscription.endAt != 0 && block.timestamp > subscription.endAt) revert SubscriptionExpired();
        if (subscription.nextPaymentAt > block.timestamp) revert PaymentNotDue();

        usdc.safeTransferFrom(subscription.payer, subscription.payee, subscription.amount);

        subscription.totalPaid += subscription.amount;
        subscription.paymentsCount += 1;

        uint256 nextPaymentAt = subscription.nextPaymentAt + subscription.interval;
        if (nextPaymentAt <= block.timestamp) {
            nextPaymentAt = block.timestamp + subscription.interval;
        }
        subscription.nextPaymentAt = nextPaymentAt;

        emit PaymentExecuted(
            subId,
            subscription.payer,
            subscription.payee,
            subscription.amount,
            nextPaymentAt,
            subscription.totalPaid,
            subscription.paymentsCount
        );
    }

    function getSubscription(uint256 subId) external view returns (SubscriptionView memory viewData) {
        Subscription storage subscription = subscriptions[subId];
        _requireSubscriptionExists(subscription);

        viewData = SubscriptionView({
            payer: subscription.payer,
            payee: subscription.payee,
            amount: subscription.amount,
            interval: subscription.interval,
            nextPaymentAt: subscription.nextPaymentAt,
            endAt: subscription.endAt,
            totalPaid: subscription.totalPaid,
            paymentsCount: subscription.paymentsCount,
            active: subscription.state == SubscriptionState.Active,
            label: subscription.label
        });
    }

    function getPayerSubscriptions(address payer) external view returns (uint256[] memory) {
        return payerSubscriptions[payer];
    }

    function isDue(uint256 subId) external view returns (bool) {
        Subscription storage subscription = subscriptions[subId];
        _requireSubscriptionExists(subscription);

        return
            subscription.state == SubscriptionState.Active &&
            (subscription.endAt == 0 || block.timestamp <= subscription.endAt) &&
            subscription.nextPaymentAt <= block.timestamp;
    }

    function getSubscriptionState(uint256 subId) external view returns (SubscriptionState) {
        Subscription storage subscription = subscriptions[subId];
        _requireSubscriptionExists(subscription);
        return subscription.state;
    }

    function _requireSubscriptionExists(Subscription storage subscription) private view {
        if (subscription.payer == address(0)) revert SubscriptionNotFound();
    }
}
