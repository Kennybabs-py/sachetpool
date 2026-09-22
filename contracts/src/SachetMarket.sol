// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";


/// @title SachetMarket
/// @notice Singleton pari-mutuel market that escrows `$SACH` stakes on 1X2
///         football outcomes. The operator opens and resolves pools; winners and
///         refundees pull their payout with `claim`.
/// @dev Money math mirrors the off-chain projection in `lib/odds.ts` exactly:
///      integer floor arithmetic, rake floored off the total pot.
contract SachetMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Outcome codes ─────────────────────────────────────────────────────
    uint8 public constant OUTCOME_UNRESOLVED = 0;
    uint8 public constant HOME = 1;
    uint8 public constant DRAW = 2;
    uint8 public constant AWAY = 3;
    uint8 public constant VOID = 4;

    // ── Limits ────────────────────────────────────────────────────────────
    uint16 public constant MAX_RAKE_BPS = 1000; // 10%
    uint16 public constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable token;
    address public immutable treasury;
    address public operator;
    uint256 public minStake;

    struct Pool {
        uint64 expiresAt;
        uint16 rakeBps;
        uint8 outcome; // 0 = unresolved, 1/2/3, 4 = void
        bool exists;
        bool resolved;
        bool refundMode;
        uint256 totalStake;
        uint256[3] stakeBySelection;
        uint256 winningStake;
        uint256 paidOut;
        uint256 treasuryCredit;
    }

    mapping(bytes32 => Pool) private pools;
    mapping(bytes32 => mapping(address => uint256[3])) private userStake;
    /// @notice True once an address has claimed a given pool.
    mapping(bytes32 => mapping(address => bool)) public claimed;

    /// @notice Rake accrued across all resolved pools, awaiting withdrawal.
    uint256 public treasuryBalance;

    // ── Events ────────────────────────────────────────────────────────────
    event PoolCreated(bytes32 indexed poolId, uint64 expiresAt, uint16 rakeBps);
    event BetPlaced(
        bytes32 indexed poolId,
        address indexed bettor,
        uint8 selection,
        uint256 amount
    );
    event PoolResolved(
        bytes32 indexed poolId,
        uint8 outcome,
        bool refundMode,
        uint256 winningStake,
        uint256 treasuryCredit
    );
    event Claimed(bytes32 indexed poolId, address indexed bettor, uint256 amount);
    event TreasuryWithdrawn(address indexed to, uint256 amount);
    event OperatorChanged(address indexed operator);
    event MinStakeChanged(uint256 minStake);

    // ── Errors ────────────────────────────────────────────────────────────
    error NotOperator();
    error PoolExists();
    error PoolMissing();
    error AlreadyResolved();
    error NotResolved();
    error BettingClosed();
    error PoolNotExpired();
    error InvalidSelection();
    error InvalidOutcome();
    error RakeTooHigh();
    error ExpiryInPast();
    error StakeTooSmall();
    error AlreadyClaimed();
    error NothingToClaim();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(
        address token_,
        address treasury_,
        address operator_,
        uint256 minStake_
    ) {
        require(
            token_ != address(0) &&
                treasury_ != address(0) &&
                operator_ != address(0),
            "SachetMarket: zero address"
        );
        token = IERC20(token_);
        treasury = treasury_;
        operator = operator_;
        minStake = minStake_;
    }

    // ── Operator lifecycle ────────────────────────────────────────────────

    /// @notice Open a new pool. Betting is rejected at/after `expiresAt`.
    function createPool(
        bytes32 poolId,
        uint64 expiresAt,
        uint16 rakeBps
    ) external onlyOperator {
        Pool storage p = pools[poolId];
        if (p.exists) revert PoolExists();
        if (expiresAt <= block.timestamp) revert ExpiryInPast();
        if (rakeBps > MAX_RAKE_BPS) revert RakeTooHigh();

        p.exists = true;
        p.expiresAt = expiresAt;
        p.rakeBps = rakeBps;

        emit PoolCreated(poolId, expiresAt, rakeBps);
    }

    /// @notice Stake `amount` on `selection` (1=HOME, 2=DRAW, 3=AWAY).
    function bet(
        bytes32 poolId,
        uint8 selection,
        uint256 amount
    ) external nonReentrant {
        Pool storage p = pools[poolId];
        if (!p.exists) revert PoolMissing();
        if (p.resolved) revert AlreadyResolved();
        if (block.timestamp >= p.expiresAt) revert BettingClosed();
        if (selection < HOME || selection > AWAY) revert InvalidSelection();
        if (amount < minStake) revert StakeTooSmall();

        token.safeTransferFrom(msg.sender, address(this), amount);

        p.totalStake += amount;
        p.stakeBySelection[selection - 1] += amount;
        userStake[poolId][msg.sender][selection - 1] += amount;

        emit BetPlaced(poolId, msg.sender, selection, amount);
    }

    /// @notice Resolve a pool. VOID (or a result nobody backed) refunds everyone.
    function resolve(bytes32 poolId, uint8 outcome) external onlyOperator {
        Pool storage p = pools[poolId];
        if (!p.exists) revert PoolMissing();
        if (p.resolved) revert AlreadyResolved();
        if (block.timestamp < p.expiresAt) revert PoolNotExpired();
        if (outcome < HOME || outcome > VOID) revert InvalidOutcome();

        p.resolved = true;
        p.outcome = outcome;

        if (outcome == VOID) {
            p.refundMode = true;
        } else {
            p.winningStake = p.stakeBySelection[outcome - 1];
            if (p.winningStake == 0) {
                // Nobody picked the winner: refund in full, take no rake.
                p.refundMode = true;
            } else {
                p.treasuryCredit = (p.totalStake * p.rakeBps) /
                    BPS_DENOMINATOR;
                treasuryBalance += p.treasuryCredit;
            }
        }

        emit PoolResolved(
            poolId,
            outcome,
            p.refundMode,
            p.winningStake,
            p.treasuryCredit
        );
    }

    /// @notice Pull your payout (proportional win, or full refund on a void).
    function claim(bytes32 poolId) external nonReentrant {
        Pool storage p = pools[poolId];
        if (!p.exists) revert PoolMissing();
        if (!p.resolved) revert NotResolved();
        if (claimed[poolId][msg.sender]) revert AlreadyClaimed();

        uint256 payout;
        if (p.refundMode) {
            uint256[3] storage s = userStake[poolId][msg.sender];
            payout = s[0] + s[1] + s[2];
        } else {
            uint256 stake = userStake[poolId][msg.sender][p.outcome - 1];
            if (stake == 0) revert NothingToClaim();
            payout =
                ((p.totalStake - p.treasuryCredit) * stake) /
                p.winningStake;
        }

        if (payout == 0) revert NothingToClaim();

        claimed[poolId][msg.sender] = true;
        p.paidOut += payout;

        token.safeTransfer(msg.sender, payout);
        emit Claimed(poolId, msg.sender, payout);
    }

    function setOperator(address newOperator) external onlyOperator {
        require(newOperator != address(0), "SachetMarket: zero address");
        operator = newOperator;
        emit OperatorChanged(newOperator);
    }

    function setMinStake(uint256 newMinStake) external onlyOperator {
        minStake = newMinStake;
        emit MinStakeChanged(newMinStake);
    }

    /// @notice Sweep accrued rake to `to`.
    function withdrawTreasury(address to) external onlyOperator {
        require(to != address(0), "SachetMarket: zero address");
        uint256 amount = treasuryBalance;
        treasuryBalance = 0;
        token.safeTransfer(to, amount);
        emit TreasuryWithdrawn(to, amount);
    }

    // ── Views ─────────────────────────────────────────────────────────────

    function getPool(bytes32 poolId) external view returns (Pool memory) {
        return pools[poolId];
    }

    function getUserStake(
        bytes32 poolId,
        address user
    ) external view returns (uint256 home, uint256 draw, uint256 away) {
        uint256[3] storage s = userStake[poolId][user];
        return (s[0], s[1], s[2]);
    }
}
