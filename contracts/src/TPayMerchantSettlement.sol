// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TPayMerchantSettlement is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum InvoiceStatus {
        None,
        Open,
        Paid,
        Cancelled
    }

    struct Invoice {
        address merchant;
        address token;
        uint256 amount;
        uint64 createdAt;
        uint64 expiresAt;
        InvoiceStatus status;
        address payer;
        bytes32 metadataHash;
        string paymentReference;
        string currencyCode;
    }

    mapping(address => bool) public supportedTokens;
    mapping(bytes32 => Invoice) public invoices;
    uint256 public maxInvoiceAmount;

    event SupportedTokenUpdated(address indexed token, bool supported);
    event MaxInvoiceAmountUpdated(uint256 amount);
    event InvoiceCreated(
        bytes32 indexed invoiceId,
        address indexed merchant,
        address indexed token,
        uint256 amount,
        uint64 expiresAt,
        string paymentReference,
        string currencyCode,
        bytes32 metadataHash
    );
    event InvoicePaid(
        bytes32 indexed invoiceId,
        address indexed merchant,
        address indexed payer,
        address token,
        uint256 amount
    );
    event InvoiceCancelled(bytes32 indexed invoiceId, address indexed merchant);

    error UnsupportedToken();
    error InvalidAmount();
    error InvalidExpiry();
    error InvoiceAlreadyExists();
    error InvoiceNotFound();
    error InvoiceNotOpen();
    error InvoiceExpired();
    error NotMerchant();
    error MaxInvoiceAmountExceeded();

    constructor(address[] memory initialSupportedTokens, uint256 initialMaxInvoiceAmount) Ownable(msg.sender) {
        maxInvoiceAmount = initialMaxInvoiceAmount;
        emit MaxInvoiceAmountUpdated(initialMaxInvoiceAmount);

        for (uint256 index = 0; index < initialSupportedTokens.length; index++) {
            supportedTokens[initialSupportedTokens[index]] = true;
            emit SupportedTokenUpdated(initialSupportedTokens[index], true);
        }
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setSupportedToken(address token, bool supported) external onlyOwner {
        supportedTokens[token] = supported;
        emit SupportedTokenUpdated(token, supported);
    }

    function setMaxInvoiceAmount(uint256 amount) external onlyOwner {
        maxInvoiceAmount = amount;
        emit MaxInvoiceAmountUpdated(amount);
    }

    function createInvoice(
        bytes32 invoiceId,
        address token,
        uint256 amount,
        uint64 expiresAt,
        string calldata paymentReference,
        string calldata currencyCode,
        bytes32 metadataHash
    ) external whenNotPaused {
        if (!supportedTokens[token]) revert UnsupportedToken();
        if (amount == 0) revert InvalidAmount();
        if (maxInvoiceAmount != 0 && amount > maxInvoiceAmount) revert MaxInvoiceAmountExceeded();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();
        if (invoices[invoiceId].status != InvoiceStatus.None) revert InvoiceAlreadyExists();

        invoices[invoiceId] = Invoice({
            merchant: msg.sender,
            token: token,
            amount: amount,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            status: InvoiceStatus.Open,
            payer: address(0),
            metadataHash: metadataHash,
            paymentReference: paymentReference,
            currencyCode: currencyCode
        });

        emit InvoiceCreated(
            invoiceId,
            msg.sender,
            token,
            amount,
            expiresAt,
            paymentReference,
            currencyCode,
            metadataHash
        );
    }

    function payInvoice(bytes32 invoiceId) external whenNotPaused nonReentrant {
        Invoice storage invoice = invoices[invoiceId];
        if (invoice.status == InvoiceStatus.None) revert InvoiceNotFound();
        if (invoice.status != InvoiceStatus.Open) revert InvoiceNotOpen();
        if (invoice.expiresAt < block.timestamp) revert InvoiceExpired();

        invoice.status = InvoiceStatus.Paid;
        invoice.payer = msg.sender;

        IERC20(invoice.token).safeTransferFrom(msg.sender, invoice.merchant, invoice.amount);

        emit InvoicePaid(invoiceId, invoice.merchant, msg.sender, invoice.token, invoice.amount);
    }

    function cancelInvoice(bytes32 invoiceId) external whenNotPaused {
        Invoice storage invoice = invoices[invoiceId];
        if (invoice.status == InvoiceStatus.None) revert InvoiceNotFound();
        if (invoice.merchant != msg.sender) revert NotMerchant();
        if (invoice.status != InvoiceStatus.Open) revert InvoiceNotOpen();

        invoice.status = InvoiceStatus.Cancelled;
        emit InvoiceCancelled(invoiceId, msg.sender);
    }

    function getInvoice(bytes32 invoiceId) external view returns (Invoice memory) {
        Invoice memory invoice = invoices[invoiceId];
        if (invoice.status == InvoiceStatus.None) revert InvoiceNotFound();
        return invoice;
    }

    function isInvoiceExpired(bytes32 invoiceId) external view returns (bool) {
        Invoice memory invoice = invoices[invoiceId];
        if (invoice.status == InvoiceStatus.None) revert InvoiceNotFound();
        return invoice.expiresAt < block.timestamp;
    }
}
