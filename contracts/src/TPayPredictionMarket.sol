// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TPayPredictionMarket is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum MarketStatus {
        None,
        Open,
        Resolved,
        Cancelled
    }

    enum Outcome {
        None,
        Yes,
        No
    }

    struct Market {
        address creator;
        IERC20 token;
        string question;
        string category;
        string metadataURI;
        uint64 createdAt;
        uint64 closeTime;
        MarketStatus status;
        Outcome winningOutcome;
        uint256 totalYes;
        uint256 totalNo;
        uint256 feeBps;
        bool feeCollected;
    }

    struct Position {
        uint256 yesAmount;
        uint256 noAmount;
        bool claimed;
    }

    uint256 public constant MAX_FEE_BPS = 500;

    IERC20 public immutable usdc;
    address public feeRecipient;
    uint256 public protocolFeeBps;
    uint256 public maxBetAmount;
    uint256 public marketCount;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Position)) private positions;
    mapping(uint256 => address[]) private marketParticipants;
    mapping(uint256 => mapping(address => bool)) private isParticipant;

    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        address indexed token,
        string question,
        string category,
        uint64 closeTime,
        string metadataURI
    );
    event BetPlaced(uint256 indexed marketId, address indexed user, Outcome indexed outcome, uint256 amount);
    event MarketResolved(uint256 indexed marketId, Outcome indexed winningOutcome);
    event MarketCancelled(uint256 indexed marketId);
    event Claimed(uint256 indexed marketId, address indexed user, uint256 amount);
    event FeeRecipientUpdated(address indexed recipient);
    event ProtocolFeeUpdated(uint256 feeBps);
    event MaxBetAmountUpdated(uint256 amount);

    error InvalidToken();
    error InvalidQuestion();
    error InvalidCloseTime();
    error InvalidAmount();
    error InvalidOutcome();
    error MarketNotFound();
    error MarketNotOpen();
    error MarketStillOpen();
    error MarketNotResolvedOrCancelled();
    error MarketCancelledError();
    error AlreadyClaimed();
    error NoPosition();
    error NoWinningPool();
    error FeeTooHigh();
    error MaxBetAmountExceeded();
    error InvalidRecipient();

    constructor(address usdcToken, address initialFeeRecipient, uint256 initialFeeBps, uint256 initialMaxBetAmount) Ownable(msg.sender) {
        if (usdcToken == address(0)) revert InvalidToken();
        if (initialFeeRecipient == address(0)) revert InvalidRecipient();
        if (initialFeeBps > MAX_FEE_BPS) revert FeeTooHigh();

        usdc = IERC20(usdcToken);
        feeRecipient = initialFeeRecipient;
        protocolFeeBps = initialFeeBps;
        maxBetAmount = initialMaxBetAmount;

        emit FeeRecipientUpdated(initialFeeRecipient);
        emit ProtocolFeeUpdated(initialFeeBps);
        emit MaxBetAmountUpdated(initialMaxBetAmount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setFeeRecipient(address nextRecipient) external onlyOwner {
        if (nextRecipient == address(0)) revert InvalidRecipient();
        feeRecipient = nextRecipient;
        emit FeeRecipientUpdated(nextRecipient);
    }

    function setProtocolFeeBps(uint256 nextFeeBps) external onlyOwner {
        if (nextFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        protocolFeeBps = nextFeeBps;
        emit ProtocolFeeUpdated(nextFeeBps);
    }

    function setMaxBetAmount(uint256 nextMaxBetAmount) external onlyOwner {
        maxBetAmount = nextMaxBetAmount;
        emit MaxBetAmountUpdated(nextMaxBetAmount);
    }

    function createMarket(
        string calldata question,
        string calldata category,
        uint64 closeTime,
        string calldata metadataURI
    ) external whenNotPaused returns (uint256 marketId) {
        if (bytes(question).length == 0) revert InvalidQuestion();
        if (closeTime <= block.timestamp) revert InvalidCloseTime();

        marketId = ++marketCount;
        markets[marketId] = Market({
            creator: msg.sender,
            token: usdc,
            question: question,
            category: category,
            metadataURI: metadataURI,
            createdAt: uint64(block.timestamp),
            closeTime: closeTime,
            status: MarketStatus.Open,
            winningOutcome: Outcome.None,
            totalYes: 0,
            totalNo: 0,
            feeBps: protocolFeeBps,
            feeCollected: false
        });

        emit MarketCreated(marketId, msg.sender, address(usdc), question, category, closeTime, metadataURI);
    }

    function placeBet(uint256 marketId, Outcome outcome, uint256 amount) external whenNotPaused nonReentrant {
        Market storage market = markets[marketId];
        if (market.status == MarketStatus.None) revert MarketNotFound();
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= market.closeTime) revert MarketStillOpen();
        if (outcome != Outcome.Yes && outcome != Outcome.No) revert InvalidOutcome();
        if (amount == 0) revert InvalidAmount();
        if (maxBetAmount != 0 && amount > maxBetAmount) revert MaxBetAmountExceeded();

        Position storage position = positions[marketId][msg.sender];
        if (!isParticipant[marketId][msg.sender]) {
            isParticipant[marketId][msg.sender] = true;
            marketParticipants[marketId].push(msg.sender);
        }

        if (outcome == Outcome.Yes) {
            position.yesAmount += amount;
            market.totalYes += amount;
        } else {
            position.noAmount += amount;
            market.totalNo += amount;
        }

        market.token.safeTransferFrom(msg.sender, address(this), amount);
        emit BetPlaced(marketId, msg.sender, outcome, amount);
    }

    function resolveMarket(uint256 marketId, Outcome winningOutcome) external onlyOwner whenNotPaused {
        Market storage market = markets[marketId];
        if (market.status == MarketStatus.None) revert MarketNotFound();
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp < market.closeTime) revert MarketStillOpen();
        if (winningOutcome != Outcome.Yes && winningOutcome != Outcome.No) revert InvalidOutcome();

        uint256 winningPool = winningOutcome == Outcome.Yes ? market.totalYes : market.totalNo;
        if (winningPool == 0) revert NoWinningPool();

        market.status = MarketStatus.Resolved;
        market.winningOutcome = winningOutcome;

        emit MarketResolved(marketId, winningOutcome);
    }

    function cancelMarket(uint256 marketId) external onlyOwner whenNotPaused {
        Market storage market = markets[marketId];
        if (market.status == MarketStatus.None) revert MarketNotFound();
        if (market.status != MarketStatus.Open) revert MarketNotOpen();

        market.status = MarketStatus.Cancelled;
        emit MarketCancelled(marketId);
    }

    function claim(uint256 marketId) external nonReentrant returns (uint256 payout) {
        Market storage market = markets[marketId];
        if (market.status == MarketStatus.None) revert MarketNotFound();
        if (market.status != MarketStatus.Resolved && market.status != MarketStatus.Cancelled) {
            revert MarketNotResolvedOrCancelled();
        }

        Position storage position = positions[marketId][msg.sender];
        if (position.claimed) revert AlreadyClaimed();

        uint256 yesAmount = position.yesAmount;
        uint256 noAmount = position.noAmount;
        if (yesAmount == 0 && noAmount == 0) revert NoPosition();

        position.claimed = true;

        if (market.status == MarketStatus.Cancelled) {
            payout = yesAmount + noAmount;
        } else {
            uint256 winningStake = market.winningOutcome == Outcome.Yes ? yesAmount : noAmount;
            if (winningStake == 0) revert NoPosition();

            uint256 winningPool = market.winningOutcome == Outcome.Yes ? market.totalYes : market.totalNo;
            uint256 losingPool = market.winningOutcome == Outcome.Yes ? market.totalNo : market.totalYes;
            uint256 feeAmount = (losingPool * market.feeBps) / 10_000;
            uint256 distributableLosingPool = losingPool - feeAmount;

            payout = winningStake + ((winningStake * distributableLosingPool) / winningPool);

            if (!market.feeCollected) {
                market.feeCollected = true;
                if (feeAmount > 0) {
                    market.token.safeTransfer(feeRecipient, feeAmount);
                }
            }
        }

        market.token.safeTransfer(msg.sender, payout);
        emit Claimed(marketId, msg.sender, payout);
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        Market memory market = markets[marketId];
        if (market.status == MarketStatus.None) revert MarketNotFound();
        return market;
    }

    function getPosition(uint256 marketId, address user) external view returns (Position memory) {
        return positions[marketId][user];
    }

    function getParticipants(uint256 marketId) external view returns (address[] memory) {
        if (markets[marketId].status == MarketStatus.None) revert MarketNotFound();
        return marketParticipants[marketId];
    }

    function previewClaim(uint256 marketId, address user) external view returns (uint256 payout) {
        Market memory market = markets[marketId];
        if (market.status == MarketStatus.None) revert MarketNotFound();

        Position memory position = positions[marketId][user];
        if (position.claimed) return 0;

        if (market.status == MarketStatus.Cancelled) {
            return position.yesAmount + position.noAmount;
        }
        if (market.status != MarketStatus.Resolved) {
            return 0;
        }

        uint256 winningStake = market.winningOutcome == Outcome.Yes ? position.yesAmount : position.noAmount;
        if (winningStake == 0) return 0;

        uint256 winningPool = market.winningOutcome == Outcome.Yes ? market.totalYes : market.totalNo;
        uint256 losingPool = market.winningOutcome == Outcome.Yes ? market.totalNo : market.totalYes;
        uint256 feeAmount = (losingPool * market.feeBps) / 10_000;
        return winningStake + ((winningStake * (losingPool - feeAmount)) / winningPool);
    }
}
