// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SachetMarket} from "../src/SachetMarket.sol";
import {MockSach} from "./mocks/MockSach.sol";

/// @notice Drives SachetMarket with random but sensible actions and keeps an
///         independent "ghost" ledger so the invariant suite can cross-check
///         the contract's own bookkeeping.
/// @dev Every external call into the market is wrapped in try/catch, and ghost
///      state is only updated on success. Reverts are therefore expected noise,
///      not failures. NOTE: vm.prank only applies to the very next external
///      call, so any reads from the market/token happen BEFORE the prank.
contract SachetMarketHandler is Test {
    SachetMarket public immutable market;
    MockSach public immutable token;
    address public immutable admin;
    address public immutable resolver;

    uint256 public constant MAX_POOLS = 5;
    uint256 public constant NUM_ACTORS = 6;

    address[] internal _actors;
    bytes32[] internal _poolIds;

    // ---- ghost ledger (tokens) ----
    uint256 public ghostDeposited; // successful placeBet
    uint256 public ghostWithdrawn; // successful withdrawBet
    uint256 public ghostPaid; // successful claim (measured as balance delta)
    uint256 public ghostDonated; // direct transfers into the market

    // ---- ghost per-pool facts ----
    mapping(bytes32 => uint256) public ghostPoolRake; // rake snapshot expected at launch
    mapping(bytes32 => bool) public ghostFinal; // pool reached RESOLVED/CANCELLED
    mapping(bytes32 => SachetMarket.PoolStatus) public ghostFinalStatus;
    mapping(bytes32 => SachetMarket.Outcome) public ghostFinalResult;
    mapping(bytes32 => mapping(address => uint256)) public ghostClaimCount;
    bool public ghostRefinalized; // a finalized pool was finalized again (must stay false)

    // ---- call counters, to confirm actions are actually reachable ----
    mapping(string => uint256) public calls;

    constructor(SachetMarket _market, MockSach _token, address _admin, address _resolver) {
        market = _market;
        token = _token;
        admin = _admin;
        resolver = _resolver;

        for (uint256 i = 0; i < NUM_ACTORS; i++) {
            address a = address(uint160(0xA000 + i));
            _actors.push(a);
            _token.mint(a, 1e36);
            vm.prank(a);
            _token.approve(address(_market), type(uint256).max);
        }
    }

    // ------------------------------------------------------------------
    // Views used by the invariant suite
    // ------------------------------------------------------------------

    function actorCount() external view returns (uint256) {
        return _actors.length;
    }

    function actorAt(uint256 i) external view returns (address) {
        return _actors[i];
    }

    function poolCount() external view returns (uint256) {
        return _poolIds.length;
    }

    function poolIdAt(uint256 i) external view returns (bytes32) {
        return _poolIds[i];
    }

    // ------------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------------

    function launchPool(uint256 durationSeed) external {
        calls["launchPool"]++;
        if (_poolIds.length >= MAX_POOLS) return;

        bytes32 id = keccak256(abi.encode("pool", _poolIds.length));
        uint64 expiresAt = uint64(block.timestamp + bound(durationSeed, 1 hours, 7 days));

        vm.prank(admin);
        try market.launchPool(id, expiresAt) {
            _poolIds.push(id);
            ghostPoolRake[id] = market.rakeBps();
        } catch {}
    }

    function placeBet(uint256 actorSeed, uint256 poolSeed, uint256 outcomeSeed, uint256 amount) external {
        calls["placeBet"]++;
        (bool ok, bytes32 id) = _pickPool(poolSeed);
        if (!ok) return;

        address actor = _pickActor(actorSeed);
        SachetMarket.Outcome outcome = SachetMarket.Outcome(bound(outcomeSeed, 1, 3));

        // a quarter of bets are tiny (1..1000 wei) to stress floor rounding
        bool tiny = amount % 4 == 0;
        amount = tiny ? bound(amount, 1, 1_000) : bound(amount, 1, 1_000e18);

        vm.prank(actor);
        try market.placeBet(id, outcome, amount) {
            ghostDeposited += amount;
        } catch {}
    }

    function withdrawBet(uint256 actorSeed, uint256 poolSeed) external {
        calls["withdrawBet"]++;
        (bool ok, bytes32 id) = _pickPool(poolSeed);
        if (!ok) return;

        address actor = _pickActor(actorSeed);
        uint256 staked = market.getUserStake(id, actor).amount; // read before prank

        vm.prank(actor);
        try market.withdrawBet(id) {
            ghostWithdrawn += staked;
        } catch {}
    }

    function advanceTime(uint256 secs) external {
        calls["advanceTime"]++;
        vm.warp(block.timestamp + bound(secs, 1 minutes, 3 days));
    }

    function resolvePool(uint256 poolSeed, uint256 resultSeed) external {
        calls["resolvePool"]++;
        (bool ok, bytes32 id) = _pickPool(poolSeed);
        if (!ok) return;

        SachetMarket.Outcome result = SachetMarket.Outcome(bound(resultSeed, 1, 4)); // HOME..VOID

        vm.prank(resolver);
        try market.resolvePool(id, result) {
            _recordFinal(id);
        } catch {}
    }

    function cancelPool(uint256 poolSeed) external {
        calls["cancelPool"]++;
        (bool ok, bytes32 id) = _pickPool(poolSeed);
        if (!ok) return;

        vm.prank(admin);
        try market.cancelPool(id) {
            _recordFinal(id);
        } catch {}
    }

    function claim(uint256 actorSeed, uint256 poolSeed) external {
        calls["claim"]++;
        (bool ok, bytes32 id) = _pickPool(poolSeed);
        if (!ok) return;

        address actor = _pickActor(actorSeed);
        uint256 balBefore = token.balanceOf(actor); // read before prank

        vm.prank(actor);
        try market.claim(id) {
            ghostPaid += token.balanceOf(actor) - balBefore;
            ghostClaimCount[id][actor]++;
        } catch {}
    }

    function setRake(uint256 rakeSeed) external {
        calls["setRake"]++;
        uint256 newRake = bound(rakeSeed, 1, 10);

        vm.prank(admin);
        try market.setRakeBps(newRake) {} catch {}
    }

    function togglePause() external {
        calls["togglePause"]++;
        bool isPaused = market.paused(); // read before prank

        vm.prank(admin);
        if (isPaused) {
            market.unpause();
        } else {
            market.pause();
        }
    }

    /// @dev Someone sends tokens straight to the market (wrong deposit / dust griefing).
    function donate(uint256 amount) external {
        calls["donate"]++;
        amount = bound(amount, 1, 1_000e18);
        token.mint(address(this), amount);
        require(token.transfer(address(market), amount), "donate failed");
        ghostDonated += amount;
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    function _recordFinal(bytes32 id) internal {
        if (ghostFinal[id]) {
            // contract let an already-finalized pool be finalized again
            ghostRefinalized = true;
            return;
        }
        SachetMarket.Pool memory p = market.getPool(id);
        ghostFinal[id] = true;
        ghostFinalStatus[id] = p.status;
        ghostFinalResult[id] = p.result;
    }

    function _pickActor(uint256 seed) internal view returns (address) {
        return _actors[seed % _actors.length];
    }

    function _pickPool(uint256 seed) internal view returns (bool, bytes32) {
        if (_poolIds.length == 0) return (false, bytes32(0));
        return (true, _poolIds[seed % _poolIds.length]);
    }
}
