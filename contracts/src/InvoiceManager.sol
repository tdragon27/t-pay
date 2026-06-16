// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract InvoiceManager is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum InvoiceStatus {
        Pending,
        Paid,
        Cancelled,
        Overdue
    }

    struct Invoice {
        address creator;
        address payer;
        uint256 amountUsdc;
        uint256 dueAt;
        uint256 paidAt;
        InvoiceStatus status;
        string metadataCid;
        string invoiceNumber;
    }

    IERC20 public immutable usdc;
    uint256 public nextInvoiceId = 1;
    uint256 public maxInvoiceAmount;
    uint256 public constant REMINDER_COOLDOWN = 1 days;

    mapping(uint256 => Invoice) private invoices;
    mapping(address => uint256[]) private creatorInvoices;
    mapping(uint256 => uint256) public lastReminderAt;

    event InvoiceCreated(
        uint256 indexed id,
        address indexed creator,
        address indexed payer,
        uint256 amountUsdc,
        uint256 dueAt,
        string invoiceNumber,
        string metadataCid
    );
    event InvoicePaid(uint256 indexed id, address indexed creator, address indexed payer, uint256 amountUsdc);
    event InvoiceCancelled(uint256 indexed id, address indexed creator);
    event InvoiceReminderSent(uint256 indexed id, address indexed creator, address indexed payer, uint256 timestamp);
    event MaxInvoiceAmountUpdated(uint256 amount);

    error ZeroAddress();
    error InvalidAmount();
    error MaxInvoiceAmountExceeded();
    error InvalidStatus();
    error InvalidPayer();
    error InvoiceNotFound();
    error InvoiceOverdue();
    error ReminderTooSoon();
    error Unauthorized();

    constructor(address usdcToken, address initialOwner, uint256 initialMaxInvoiceAmount) Ownable(initialOwner) {
        if (usdcToken == address(0) || initialOwner == address(0)) revert ZeroAddress();
        usdc = IERC20(usdcToken);
        maxInvoiceAmount = initialMaxInvoiceAmount;
        emit MaxInvoiceAmountUpdated(initialMaxInvoiceAmount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setMaxInvoiceAmount(uint256 amount) external onlyOwner {
        maxInvoiceAmount = amount;
        emit MaxInvoiceAmountUpdated(amount);
    }

    function createInvoice(
        address payer,
        uint256 amountUsdc,
        uint256 dueAt,
        string calldata invoiceNumber,
        string calldata metadataCid
    ) external whenNotPaused returns (uint256 id) {
        if (amountUsdc == 0) revert InvalidAmount();
        if (maxInvoiceAmount != 0 && amountUsdc > maxInvoiceAmount) revert MaxInvoiceAmountExceeded();
        if (payer == address(this)) revert InvalidPayer();
        if (dueAt != 0 && dueAt < block.timestamp) revert InvoiceOverdue();

        id = nextInvoiceId++;
        invoices[id] = Invoice({
            creator: msg.sender,
            payer: payer,
            amountUsdc: amountUsdc,
            dueAt: dueAt,
            paidAt: 0,
            status: InvoiceStatus.Pending,
            metadataCid: metadataCid,
            invoiceNumber: invoiceNumber
        });
        creatorInvoices[msg.sender].push(id);

        emit InvoiceCreated(id, msg.sender, payer, amountUsdc, dueAt, invoiceNumber, metadataCid);
    }

    function payInvoice(uint256 id) external whenNotPaused nonReentrant {
        Invoice storage invoice = invoices[id];
        _requireInvoiceExists(invoice);
        if (_effectiveStatus(invoice) != InvoiceStatus.Pending) revert InvalidStatus();
        if (invoice.payer != address(0) && invoice.payer != msg.sender) revert Unauthorized();

        invoice.paidAt = block.timestamp;
        invoice.status = InvoiceStatus.Paid;

        usdc.safeTransferFrom(msg.sender, invoice.creator, invoice.amountUsdc);

        emit InvoicePaid(id, invoice.creator, msg.sender, invoice.amountUsdc);
    }

    function cancelInvoice(uint256 id) external whenNotPaused {
        Invoice storage invoice = invoices[id];
        _requireInvoiceExists(invoice);
        if (invoice.creator != msg.sender) revert Unauthorized();
        if (_effectiveStatus(invoice) != InvoiceStatus.Pending) revert InvalidStatus();

        invoice.status = InvoiceStatus.Cancelled;
        emit InvoiceCancelled(id, msg.sender);
    }

    function sendReminder(uint256 id) external whenNotPaused {
        Invoice storage invoice = invoices[id];
        _requireInvoiceExists(invoice);
        if (invoice.creator != msg.sender) revert Unauthorized();

        InvoiceStatus status = _effectiveStatus(invoice);
        if (status != InvoiceStatus.Pending && status != InvoiceStatus.Overdue) revert InvalidStatus();
        if (lastReminderAt[id] != 0 && block.timestamp - lastReminderAt[id] < REMINDER_COOLDOWN) revert ReminderTooSoon();

        lastReminderAt[id] = block.timestamp;
        emit InvoiceReminderSent(id, invoice.creator, invoice.payer, block.timestamp);
    }

    function getInvoice(uint256 id) external view returns (Invoice memory invoice) {
        Invoice storage storedInvoice = invoices[id];
        _requireInvoiceExists(storedInvoice);
        invoice = storedInvoice;
        invoice.status = _effectiveStatus(storedInvoice);
    }

    function getCreatorInvoices(address creator) external view returns (uint256[] memory) {
        return creatorInvoices[creator];
    }

    function _effectiveStatus(Invoice storage invoice) private view returns (InvoiceStatus) {
        if (invoice.status == InvoiceStatus.Pending && invoice.dueAt != 0 && block.timestamp > invoice.dueAt) {
            return InvoiceStatus.Overdue;
        }
        return invoice.status;
    }

    function _requireInvoiceExists(Invoice storage invoice) private view {
        if (invoice.creator == address(0)) revert InvoiceNotFound();
    }
}
