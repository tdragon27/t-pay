// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title T Pay Passport Anchor
/// @notice Stores a lightweight on-chain achievement hash for Arc Testnet wallets.
/// @dev The app keeps scoring locally. This contract only anchors a bytes32 proof hash.
contract PassportAnchor is Ownable {
    struct Anchor {
        bytes32 contentHash;
        uint32 level;
        uint64 timestamp;
    }

    mapping(address => Anchor) private anchors;

    event AchievementAnchored(address indexed user, bytes32 indexed contentHash, uint32 level, uint64 timestamp);
    event AchievementCleared(address indexed user);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function anchorAchievement(bytes32 contentHash, uint32 level) external {
        require(contentHash != bytes32(0), "PassportAnchor: empty hash");
        Anchor memory current = anchors[msg.sender];
        require(level >= current.level, "PassportAnchor: cannot downgrade level");

        uint64 timestamp = uint64(block.timestamp);
        anchors[msg.sender] = Anchor({contentHash: contentHash, level: level, timestamp: timestamp});
        emit AchievementAnchored(msg.sender, contentHash, level, timestamp);
    }

    function clearMyAnchor() external {
        delete anchors[msg.sender];
        emit AchievementCleared(msg.sender);
    }

    function getAnchor(address user) external view returns (bytes32 contentHash, uint32 level, uint64 timestamp) {
        Anchor memory anchor = anchors[user];
        return (anchor.contentHash, anchor.level, anchor.timestamp);
    }
}